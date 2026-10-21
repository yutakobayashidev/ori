import asyncio
import json
import struct
import tempfile
import threading
import unittest
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.error import HTTPError

from collector import (
    SERVICE,
    Outbox,
    decode,
    deliver,
    discover,
    load_config,
    send_pending,
)
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESCCM

MAC = "AA:BB:CC:DD:EE:FF"
KEY = bytes.fromhex("00112233445566778899aabbccddeeff")
NOW = 1792526400


def packet(
    timestamp=NOW, centikg=6543, profile=2, product=0x4DCB, with_mac=False, counter=1
):
    """Synthetic authenticated MiBeacon v5 frame, never a real person's data."""
    header = struct.pack("<HHB", 0x5958 if with_mac else 0x5948, product, counter)
    address = bytes.fromhex("FFEEDDCCBBAA")
    extended_counter = b"\x01\x02\x03"
    plaintext = b"\x16\x4e\x09" + struct.pack("<BII", profile, centikg, timestamp)
    encrypted = AESCCM(KEY, tag_length=4).encrypt(
        address + header[2:5] + extended_counter, plaintext, b"\x11"
    )
    return (
        header
        + (address if with_mac else b"")
        + encrypted[:-4]
        + extended_counter
        + encrypted[-4:]
    )


@contextmanager
def server(status=200, response=None):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, self.headers.get("Authorization"), body))
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Location", "/must-not-follow")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    response if response is not None else {"id": body["id"]}
                ).encode()
            )

    http = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield (
            {
                "endpoint": f"http://127.0.0.1:{http.server_port}/api/collect/xiaomi-scale",
                "token": "t" * 32,
            },
            requests,
        )
    finally:
        http.shutdown()
        thread.join()
        http.server_close()


class MeasurementTests(unittest.TestCase):
    def test_final_measurement_all_s200_variants_and_header_formats(self):
        for product in (0x45C9, 0x4C04, 0x4DCB, 0x4DCC):
            for with_mac in (False, True):
                with self.subTest(product=product, with_mac=with_mac):
                    raw = packet(product=product, with_mac=with_mac)
                    result = decode(raw, MAC, KEY, NOW + 10)
                    self.assertEqual(result["weightKg"], 65.43)
                    self.assertEqual(result["profileId"], 2)
                    self.assertEqual(result["measuredAt"], "2026-10-20T20:00:00.000Z")
                    self.assertEqual(result["rawAdvertisement"], raw.hex())

    def test_wrong_key_or_tampering_never_yields_a_measurement(self):
        with self.assertRaises(InvalidTag):
            decode(packet(), MAC, b"x" * 16, NOW)
        raw = bytearray(packet())
        raw[8] ^= 1
        with self.assertRaises(InvalidTag):
            decode(bytes(raw), MAC, KEY, NOW)

    def test_ignores_idle_other_devices_zero_and_out_of_range(self):
        for raw in (
            b"",
            b"\x10\x59\xcb\x4d\x01",
            packet(product=0x3BD5),
            packet(centikg=0),
            packet(centikg=15001),
        ):
            self.assertIsNone(decode(raw, MAC, KEY, NOW))

    def test_clock_must_be_valid_instead_of_inventing_measurement_time(self):
        for timestamp in (0, NOW + 301):
            with self.assertRaises(ValueError):
                decode(packet(timestamp=timestamp), MAC, KEY, NOW)
        self.assertIsNotNone(decode(packet(timestamp=NOW - 86400), MAC, KEY, NOW))

    def test_rebroadcast_has_same_identity_but_new_weigh_in_does_not(self):
        first = decode(packet(), MAC, KEY, NOW)
        repeat = decode(packet(counter=2), MAC, KEY, NOW + 15)
        later = decode(packet(timestamp=NOW + 60), MAC, KEY, NOW + 60)
        self.assertEqual(first["id"], repeat["id"])
        self.assertNotEqual(first["id"], later["id"])


class DiscoveryTests(unittest.TestCase):
    def test_local_s200_variant_is_detected_once_with_visible_progress(self):
        class Scanner:
            def __init__(self, detection_callback, adapter):
                self.callback = detection_callback

            async def __aenter__(self):
                # Real observed product ID, with synthetic address/frame counter.
                advertisement = SimpleNamespace(
                    service_data={SERVICE: bytes.fromhex("1059cc4d01")}
                )
                for _ in range(2):
                    self.callback(SimpleNamespace(address=MAC), advertisement)

            async def __aexit__(self, *_):
                pass

        with (
            patch("collector.BleakScanner", Scanner),
            patch("collector.asyncio.sleep", new_callable=AsyncMock),
            patch("builtins.print") as output,
            self.assertLogs("ori-s200", level="INFO") as logs,
        ):
            asyncio.run(discover(1, "hci0"))
        output.assert_called_once()
        self.assertEqual(
            json.loads(output.call_args.args[0]),
            {"deviceId": MAC, "productId": "0x4dcc"},
        )
        self.assertTrue(any("Scanner active" in line for line in logs.output))
        self.assertTrue(
            any(
                "2 advertisements from 1 devices; S200 found: 1" in line
                for line in logs.output
            )
        )


class DeliveryTests(unittest.TestCase):
    def test_restart_and_duplicate_preserve_original_payload_and_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            first = decode(packet(), MAC, KEY, NOW)
            box = Outbox(directory)
            self.assertTrue(box.capture(first))
            box.close()
            box = Outbox(directory)
            self.assertFalse(box.capture(decode(packet(counter=2), MAC, KEY, NOW + 10)))
            self.assertEqual(json.loads(box.pending()[1]), first)
            with server() as (config, requests):
                self.assertTrue(asyncio.run(send_pending(box, config)))
                self.assertEqual(
                    requests[0],
                    ("/api/collect/xiaomi-scale", "Bearer " + "t" * 32, first),
                )
            box.close()
            box = Outbox(directory)
            self.assertIsNone(box.pending())
            self.assertFalse(box.capture(first))
            self.assertTrue(
                box.capture(decode(packet(timestamp=NOW + 60), MAC, KEY, NOW + 60))
            )
            box.close()

    def test_unavailable_server_or_wrong_ack_keeps_record_for_retry(self):
        for status, response in (
            (503, {}),
            (200, {"id": "wrong"}),
            (200, []),
            (302, {}),
        ):
            with (
                self.subTest(status=status, response=response),
                tempfile.TemporaryDirectory() as directory,
            ):
                box = Outbox(directory)
                record = decode(packet(), MAC, KEY, NOW)
                box.capture(record)
                with server(status, response) as (config, requests):
                    with self.assertRaises((HTTPError, ValueError)):
                        asyncio.run(send_pending(box, config))
                    self.assertEqual(len(requests), 1)
                self.assertEqual(json.loads(box.pending()[1]), record)
                box.close()

    def test_lost_ack_can_replay_exact_body(self):
        with tempfile.TemporaryDirectory() as directory:
            box = Outbox(directory)
            box.capture(decode(packet(), MAC, KEY, NOW))
            with server() as (config, requests):
                deliver(
                    config, box.pending()[1]
                )  # server saved, collector died before ack
                box.close()
                box = Outbox(directory)
                asyncio.run(send_pending(box, config))
                self.assertEqual(requests[0], requests[1])
            self.assertIsNone(box.pending())
            box.close()

    def test_conflicting_values_cannot_silently_replace_history(self):
        with tempfile.TemporaryDirectory() as directory:
            box = Outbox(directory)
            box.capture(decode(packet(), MAC, KEY, NOW))
            with self.assertRaises(ValueError):
                box.capture(decode(packet(centikg=7000), MAC, KEY, NOW))
            self.assertEqual(json.loads(box.pending()[1])["weightKg"], 65.43)
            box.close()


class ConfigTests(unittest.TestCase):
    def test_secret_permissions_and_remote_http_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            config = {
                "deviceId": MAC,
                "bindkey": KEY.hex(),
                "profileId": 2,
                "endpoint": "http://127.0.0.1:3000/api/collect/xiaomi-scale",
                "token": "t" * 32,
                "stateDir": directory,
            }
            path.write_text(json.dumps(config))
            path.chmod(0o600)
            self.assertEqual(load_config(path), config)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                load_config(path)
            path.chmod(0o600)
            config["endpoint"] = "http://example.com/api/collect/xiaomi-scale"
            path.write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                load_config(path)


if __name__ == "__main__":
    unittest.main()
