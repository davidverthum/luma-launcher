#!/bin/bash
# Luma — сборка для macOS (.dmg, Apple Silicon + Intel) прямо на этом Маке.
# Запуск: bash build-mac.sh            — macOS
#         bash build-mac.sh --windows  — плюс установщик Windows (.exe) через cargo-xwin
# Лог: build-log.txt · Готовые файлы: builds/
set -uo pipefail
cd "$(dirname "$0")" || exit 1
ROOT="$PWD"
OUT="$ROOT/builds"
LOG="$ROOT/build-log.txt"
WITH_WIN=0
for a in "$@"; do [ "$a" = "--windows" ] && WITH_WIN=1; done
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

step() { printf '\n\033[1;92m▶ %s\033[0m\n' "$1"; }
note() { printf '\033[0;33m  %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;91m✖ %s\033[0m\n  Лог: %s\n' "$1" "$LOG"; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Этот скрипт для macOS. На Ubuntu Windows-версию собирает build-windows-linux.sh"

step "Проверяю инструменты"
xcode-select -p >/dev/null 2>&1 || { xcode-select --install >/dev/null 2>&1; fail "Нужны Xcode Command Line Tools — установщик открыт. После установки запусти скрипт ещё раз."; }

BREW=""
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && BREW="$b" && break; done
[ -n "$BREW" ] && eval "$("$BREW" shellenv)"

[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
if ! command -v rustup >/dev/null 2>&1; then
  step "Ставлю Rust (rustup)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal || fail "Не поставился Rust"
  . "$HOME/.cargo/env"
fi
rustup toolchain install stable --profile minimal >/dev/null 2>&1 || true
rustup default stable >/dev/null 2>&1 || true
TARGETS="aarch64-apple-darwin x86_64-apple-darwin"
[ "$WITH_WIN" = 1 ] && TARGETS="$TARGETS x86_64-pc-windows-msvc"
rustup target add $TARGETS || fail "Не добавились цели Rust"
note "$(rustc -V)"

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ]; then
  if [ -n "$BREW" ]; then
    step "Ставлю Node.js"
    "$BREW" install node || fail "Не поставился Node.js"
  else
    step "Скачиваю Node.js локально"
    NARCH=arm64; [ "$(uname -m)" = "x86_64" ] && NARCH=x64
    NODE_DIR="node-v22.20.0-darwin-$NARCH"
    mkdir -p "$ROOT/.tools"
    curl -fsSL "https://nodejs.org/dist/v22.20.0/$NODE_DIR.tar.gz" | tar xz -C "$ROOT/.tools" || fail "Не скачался Node.js"
    export PATH="$ROOT/.tools/$NODE_DIR/bin:$PATH"
  fi
fi
note "node $(node -v)"

step "Ставлю зависимости интерфейса"
npm ci --no-audit --no-fund || fail "npm ci не прошёл"

mkdir -p "$OUT"

step "Собираю macOS — universal (Apple Silicon + Intel), 5–10 минут"
CI=true npm run tauri build -- --target universal-apple-darwin --bundles app,dmg || fail "Сборка macOS не удалась"
cp -f src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg "$OUT/" || fail "Не нашёл .dmg"

WIN_OK=1
if [ "$WITH_WIN" = 1 ]; then
  step "Готовлю кросс-сборку Windows (cargo-xwin + NSIS + LLVM)"
  if [ -n "$BREW" ]; then
    "$BREW" list nsis >/dev/null 2>&1 || "$BREW" install nsis || WIN_OK=0
    "$BREW" list llvm >/dev/null 2>&1 || "$BREW" install llvm || WIN_OK=0
    export PATH="$("$BREW" --prefix llvm)/bin:$PATH"
  else
    WIN_OK=0
    note "Нет Homebrew: для Windows-сборки нужны NSIS и LLVM (https://brew.sh). macOS-сборка уже готова."
  fi
  if [ "$WIN_OK" = 1 ] && ! command -v cargo-xwin >/dev/null 2>&1; then
    cargo install --locked cargo-xwin || WIN_OK=0
  fi
  if [ "$WIN_OK" = 1 ]; then
    step "Собираю Windows (x64, установщик NSIS)"
    note "cargo-xwin при первом запуске скачивает Microsoft CRT и Windows SDK (~1 ГБ) по их лицензии."
    # makensis падает с std::bad_alloc в голой "C" локали (её даёт `set -u` без LANG) — нужна настоящая UTF-8 локаль.
    if XWIN_ACCEPT_LICENSE=1 CI=true LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc; then
      cp -f src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe "$OUT/" || WIN_OK=0
    else
      WIN_OK=0
      note "Windows-сборка не удалась — подробности в build-log.txt"
    fi
  fi
fi

step "Готово"
ls -lh "$OUT"
[ "$WIN_OK" = 1 ] || note "Windows-версия не собралась, macOS-версия — в builds/"
open "$OUT" 2>/dev/null || true
