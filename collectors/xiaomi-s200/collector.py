"""S200 final measurements → durable local outbox → Ori.

MiBeacon layout references: ESPHome xiaomi_body_scale documentation and
Bluetooth-Devices/xiaomi-ble v1.21.1 obj4e16. No Home Assistant runtime needed.
"""

import argparse
import asyncio
import json
import logging
import os
import re
import signal
import sqlite3
import stat
import struct
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from bleak import BleakScanner
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESCCM

SERVICE = "0000fe95-0000-1000-8000-00805f9b34fb"
# 0x4DCC also advertises as Xiaomi Scale S200 on the local device.
# Its discovery is hardware-verified; encrypted measurement decoding is pending.
PRODUCTS = {0x45C9, 0x4C04, 0x4DCB, 0x4DCC}
LOG = logging.getLogger("ori-s200")


def iso(timestamp):
    return (
        datetime.fromtimestamp(timestamp, timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def decode(data, mac, key, received_at):
    """Return only authenticated final S200 readings; ignore idle/other frames.

    A valid device clock is required: inventing a new measurement time for a
    replayed advertisement would duplicate old weigh-ins after a restart.
    """
    if len(data) < 5:
        return None
    flags, product = struct.unpack_from("<HH", data)
    if product not in PRODUCTS or flags >> 12 != 5 or flags & 0x48 != 0x48:
        return None
    offset = 5
    mac_bytes = bytes.fromhex(mac.replace(":", ""))[::-1]
    if flags & 0x10:
        if data[offset : offset + 6] != mac_bytes:
            return None
        offset += 6
    # S200 measurement packets have no capability section. Do not guess offsets
    # for an unimplemented wire format.
    if flags & 0x20 or len(data) < offset + 7 + 12:
        return None
    nonce = mac_bytes + data[2:5] + data[-7:-4]
    plain = AESCCM(key, tag_length=4).decrypt(
        nonce, data[offset:-7] + data[-4:], b"\x11"
    )
    if len(plain) != 12 or plain[:3] != b"\x16\x4e\x09":
        return None
    profile, centikg, timestamp = struct.unpack("<BII", plain[3:])
    if not 0 < centikg <= 15000:
        return None
    if not 1577836800 <= timestamp <= received_at + 300:
        raise ValueError(
            "Invalid scale clock; initialize/sync the scale clock with Xiaomi Home"
        )
    return {
        "id": str(
            uuid.uuid5(uuid.NAMESPACE_URL, f"ori:s200:{mac}:{profile}:{timestamp}")
        ),
        "deviceId": mac,
        "measuredAt": iso(timestamp),
        "receivedAt": iso(received_at),
        "weightKg": centikg / 100,
        "profileId": profile,
        "rawAdvertisement": data.hex(),
    }


def load_config(path):
    if not path.is_absolute():
        raise ValueError("Config path must be absolute")
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("Config must be private (chmod 600)")
    config = json.loads(path.read_text())
    required = {"deviceId", "bindkey", "profileId", "endpoint", "token", "stateDir"}
    if set(config) - (required | {"adapter"}) or not required <= set(config):
        raise ValueError("Unexpected or missing config fields")
    if not isinstance(config["deviceId"], str) or not re.fullmatch(
        r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", config["deviceId"]
    ):
        raise ValueError("deviceId must be an uppercase Bluetooth MAC address")
    if not isinstance(config["bindkey"], str) or not re.fullmatch(
        r"[0-9a-fA-F]{32}", config["bindkey"]
    ):
        raise ValueError("bindkey must contain 32 hexadecimal characters")
    if type(config["profileId"]) is not int or not 0 <= config["profileId"] <= 255:
        raise ValueError("profileId must be an integer between 0 and 255")
    if not isinstance(config["token"], str) or not re.fullmatch(
        r"[A-Za-z0-9_-]{32,1024}", config["token"]
    ):
        raise ValueError(
            "token must be a random URL-safe secret of at least 32 characters"
        )
    if (
        not isinstance(config["stateDir"], str)
        or not Path(config["stateDir"]).is_absolute()
    ):
        raise ValueError("stateDir must be an absolute path")
    if not isinstance(config["endpoint"], str):
        raise TypeError("endpoint must be a URL")
    url = urlsplit(config["endpoint"])
    local_http = url.scheme == "http" and url.hostname in {
        "localhost",
        "127.0.0.1",
        "::1",
    }
    if (
        (url.scheme != "https" and not local_http)
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or url.path != "/api/collect/xiaomi-scale"
    ):
        raise ValueError(
            "endpoint must use HTTPS (or loopback HTTP) and /api/collect/xiaomi-scale"
        )
    if "adapter" in config and not re.fullmatch(r"hci\d+", config["adapter"]):
        raise ValueError("adapter must be a BlueZ adapter name such as hci0")
    return config


class Outbox:
    """Keep acknowledged records too, so repeated BLE broadcasts stay deduped."""

    def __init__(self, directory):
        directory = Path(directory)
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if stat.S_IMODE(directory.stat().st_mode) & 0o077:
            raise ValueError("stateDir must be private (chmod 700)")
        self.db = sqlite3.connect(directory / "measurements.sqlite3")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS measurements (id TEXT PRIMARY KEY, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)"
        )
        self.db.commit()

    def capture(self, payload):
        existing = self.db.execute(
            "SELECT payload FROM measurements WHERE id=?", (payload["id"],)
        ).fetchone()
        if existing:
            original = json.loads(existing[0])
            if any(
                original[k] != payload[k]
                for k in ("deviceId", "measuredAt", "weightKg", "profileId")
            ):
                raise ValueError(
                    "Conflicting measurement for the same device timestamp"
                )
            return False
        with self.db:
            self.db.execute(
                "INSERT INTO measurements(id,payload) VALUES (?,?)",
                (payload["id"], json.dumps(payload, separators=(",", ":"))),
            )
        return True

    def pending(self):
        return self.db.execute(
            "SELECT id,payload FROM measurements WHERE sent=0 ORDER BY rowid LIMIT 1"
        ).fetchone()

    def acknowledge(self, identity):
        with self.db:
            self.db.execute("UPDATE measurements SET sent=1 WHERE id=?", (identity,))

    def close(self):
        self.db.close()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def deliver(config, body):
    request = Request(
        config["endpoint"],
        data=body.encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {config['token']}",
            "Content-Type": "application/json",
        },
    )
    # Never forward device credentials to a redirect destination.
    try:
        response = build_opener(NoRedirect()).open(request, timeout=15)
    except HTTPError as error:
        error.close()
        raise
    with response:
        if response.status != 200:
            raise ValueError("Unexpected collector response status")
        ack = json.loads(response.read(4096))
        if not isinstance(ack, dict) or ack.get("id") != json.loads(body)["id"]:
            raise ValueError("Collector did not acknowledge this measurement")


async def send_pending(outbox, config):
    pending = outbox.pending()
    if not pending:
        return False
    identity, body = pending
    await asyncio.to_thread(deliver, config, body)
    outbox.acknowledge(identity)
    LOG.info("Measurement acknowledged by Ori")
    return True


async def run(config):
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    outbox = Outbox(config["stateDir"])
    key = bytes.fromhex(config["bindkey"])
    last_warning = 0.0
    persistence_failed = False
    observed_profiles = set()

    def capture(device, advertisement):
        nonlocal last_warning, persistence_failed
        if device.address.upper() != config["deviceId"]:
            return
        data = advertisement.service_data.get(SERVICE)
        if data is None:
            return
        try:
            record = decode(data, config["deviceId"], key, time.time())
            if record and record["profileId"] not in observed_profiles:
                observed_profiles.add(record["profileId"])
                LOG.info(
                    "S200 profile %s observed; configured profile %s",
                    record["profileId"],
                    config["profileId"],
                )
            if (
                record
                and record["profileId"] == config["profileId"]
                and outbox.capture(record)
            ):
                LOG.info("Final measurement saved locally")
        except sqlite3.Error:
            LOG.error("Local persistence failed; stopping collector")
            persistence_failed = True
            stop.set()
        except (ValueError, InvalidTag) as error:
            # No key, weight, payload or authentication response in logs.
            if time.monotonic() - last_warning > 60:
                LOG.warning(
                    "Measurement rejected (%s); check bindkey and scale clock",
                    type(error).__name__,
                )
                last_warning = time.monotonic()

    async def sender():
        while not stop.is_set():
            try:
                if await send_pending(outbox, config):
                    continue
            except HTTPError as error:
                LOG.warning("Ori returned HTTP %s; record remains queued", error.code)
            except (URLError, OSError, ValueError):
                LOG.warning(
                    "Ori unavailable or acknowledgment invalid; record remains queued"
                )
            try:
                await asyncio.wait_for(stop.wait(), timeout=10)
            except TimeoutError:
                pass

    try:
        async with BleakScanner(
            detection_callback=capture, adapter=config.get("adapter", "hci0")
        ):
            LOG.info("Listening for configured S200; pending records will be retried")
            await sender()
            if persistence_failed:
                raise OSError("Local persistence failed")
    finally:
        outbox.close()


async def discover(seconds, adapter):
    seen = set()
    devices = set()
    packets = 0

    def report(device, advertisement):
        nonlocal packets
        packets += 1
        devices.add(device.address)
        data = advertisement.service_data.get(SERVICE, b"")
        if (
            len(data) >= 4
            and int.from_bytes(data[2:4], "little") in PRODUCTS
            and device.address not in seen
        ):
            seen.add(device.address)
            print(
                json.dumps(
                    {
                        "deviceId": device.address.upper(),
                        "productId": hex(int.from_bytes(data[2:4], "little")),
                    }
                ),
                flush=True,
            )

    LOG.info("Starting Bluetooth scan on %s", adapter)
    async with BleakScanner(detection_callback=report, adapter=adapter):
        LOG.info("Scanner active for %s seconds; step on the scale now", seconds)
        for elapsed in range(0, seconds, 10):
            await asyncio.sleep(min(10, seconds - elapsed))
            LOG.info(
                "Received %s advertisements from %s devices; S200 found: %s",
                packets,
                len(devices),
                len(seen),
            )
    if not seen:
        LOG.warning("No S200 found; activate the scale and check Bluetooth range")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    scan = commands.add_parser(
        "discover", help="Find S200 MAC addresses without a bindkey"
    )
    scan.add_argument(
        "--seconds", type=int, default=30, choices=range(1, 301), metavar="1..300"
    )
    scan.add_argument("--adapter", default="hci0")
    for command in ("run", "check"):
        child = commands.add_parser(
            command,
            help="Collect continuously"
            if command == "run"
            else "Validate configuration without scanning or sending",
        )
        child.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        if args.command == "discover":
            asyncio.run(discover(args.seconds, args.adapter))
        else:
            config = load_config(args.config)
            if args.command == "run":
                asyncio.run(run(config))
            else:
                print("Configuration valid")
    except KeyboardInterrupt:
        pass
    except Exception as error:  # noqa: BLE001 -- redact third-party exceptions at CLI boundary
        # Third-party errors can contain credentials; do not log their values.
        LOG.error(
            "Collector stopped (%s); check configuration, Bluetooth and file permissions",
            type(error).__name__,
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
