{ lib, beamPackages }:
beamPackages.mixRelease rec {
  pname = "workspace-runtime";
  version = "0.1.0";
  src = lib.cleanSourceWith {
    src = ./.;
    filter = path: type: !(builtins.elem (baseNameOf path) [ "deps" "_build" "erl_crash.dump" ]);
  };
  mixFodDeps = beamPackages.fetchMixDeps {
    pname = "workspace-runtime-deps";
    inherit version src;
    hash = "sha256-WCiX1hMXqLi0p1FThI0ANQ8nL2yPG0kixHdJXk9kefE=";
  };
}
