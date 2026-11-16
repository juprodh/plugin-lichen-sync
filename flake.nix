{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      obsidianPkgs = import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "obsidian";
      };
      hotReload = pkgs.fetchFromGitHub {
        owner = "pjeby";
        repo = "hot-reload";
        rev = "0.3.1";
        hash = "sha256-h1368UEB2wiRyi+cOHWp67go4ICaORMw2UIIDkuWer8=";
      };
    in
    {
      devShells.${system} = {
        default = pkgs.mkShell {
          packages = [ pkgs.bun ];
        };
        # A test Obsidian for scripts/obsidian.sh; apart from the default shell, which the checks use.
        obsidian = pkgs.mkShell {
          packages = [
            pkgs.bun
            obsidianPkgs.obsidian
            pkgs.xvfb-run
          ];
          HOT_RELOAD_PLUGIN = hotReload;
        };
      };
    };
}
