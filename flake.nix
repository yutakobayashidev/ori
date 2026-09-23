{
  description = "Intentional X reader";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.agent-skills-nix.url = "github:Kyure-A/agent-skills-nix";
  inputs.hallmark = {
    url = "github:Nutlope/hallmark";
    flake = false;
  };

  outputs = inputs@{ self, nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      mkTwitterLite = pkgs:
        pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "twitter-lite";
          version = "0.0.0";
          src = self;

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            pnpm = pkgs.pnpm_11;
            fetcherVersion = 4;
            hash = "sha256-YvGR8+dK3vq+ZEFughFGZTBARQ134JnhzflNE/mMlWk=";
          };

          nativeBuildInputs = with pkgs; [
            makeWrapper
            nodejs_22
            pnpm_11
            pnpmConfigHook
          ];

          buildPhase = ''
            runHook preBuild
            pnpm build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/twitter-lite
            cp -r .output/. $out/lib/twitter-lite/
            makeWrapper ${nixpkgs.lib.getExe pkgs.nodejs_22} $out/bin/twitter-lite \
              --add-flags "$out/lib/twitter-lite/server/index.mjs"
            runHook postInstall
          '';

          meta.mainProgram = "twitter-lite";
        });
    in {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          twitter-lite = mkTwitterLite pkgs;
        in {
          inherit twitter-lite;
          default = twitter-lite;
        });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          agentLib = inputs.agent-skills-nix.lib.agent-skills;
          sources.hallmark = {
            path = inputs.hallmark;
            subdir = "skills";
          };
          catalog = agentLib.discoverCatalog sources;
          allowlist = agentLib.allowlistFor {
            inherit catalog sources;
            enableAll = true;
          };
          selection = agentLib.selectSkills {
            inherit catalog allowlist sources;
            skills = { };
          };
          bundle = agentLib.mkBundle { inherit pkgs selection; };
          localTargets = builtins.mapAttrs (_: target:
            target // {
              enable = true;
            }) agentLib.defaultLocalTargets;
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [ nodejs_22 pnpm chromium ];
            shellHook = agentLib.mkShellHook {
              inherit pkgs bundle;
              targets = localTargets;
            };
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            PLAYWRIGHT_CHROMIUM_EXECUTABLE =
              "${pkgs.chromium}/bin/chromium";
          };
        });

      nixosModules.default = { config, lib, pkgs, ... }:
        let cfg = config.services.twitter-lite;
        in {
          options.services.twitter-lite = {
            enable = lib.mkEnableOption "Twitter Lite";

            package = lib.mkOption {
              type = lib.types.package;
              default = mkTwitterLite pkgs;
              defaultText = lib.literalExpression "twitter-lite.packages.\${pkgs.system}.default";
              description = "Twitter Lite package to run.";
            };

            relayBaseUrl = lib.mkOption {
              type = lib.types.nonEmptyStr;
              example = "http://127.0.0.1:6900";
              description = "Base URL of the Twitter relay.";
            };

            profileName = lib.mkOption {
              type = lib.types.nullOr lib.types.nonEmptyStr;
              default = null;
              example = "default";
              description = "Relay profile to use when the relay has multiple profiles.";
            };

            host = lib.mkOption {
              type = lib.types.nonEmptyStr;
              default = "127.0.0.1";
              description = "Address on which Twitter Lite listens.";
            };

            port = lib.mkOption {
              type = lib.types.port;
              default = 3000;
              description = "Port on which Twitter Lite listens.";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.twitter-lite = {
              description = "Twitter Lite";
              after = [ "network.target" ];
              wantedBy = [ "multi-user.target" ];
              environment = {
                HOST = cfg.host;
                PORT = toString cfg.port;
                TWITTER_RELAY_BASE_URL = cfg.relayBaseUrl;
              } // lib.optionalAttrs (cfg.profileName != null) {
                BIRD_PROFILE_NAME = cfg.profileName;
              };
              serviceConfig = {
                DynamicUser = true;
                ExecStart = lib.getExe cfg.package;
                Restart = "on-failure";
              };
            };
          };
        };
    };
}
