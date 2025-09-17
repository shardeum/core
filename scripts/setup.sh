#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="18.19.1"

# Install build dependencies if apt-get is available
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y build-essential curl git python3
fi

# Install nvm if missing
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

# Install Rust if cargo is missing
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

# Install npm packages
npm install

cat <<INFO

Setup complete. Node version: $(node --version)
Rust version: $(rustc --version | cut -d' ' -f1-2)
INFO
