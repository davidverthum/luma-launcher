#!/bin/bash
# Luma — Windows-сборка (x64, установщик NSIS) на Ubuntu 24.04 без rustup-целей.
# Rust 1.91 из репозитория Ubuntu + исходники его std, собранные под Windows (build-std), MinGW-w64 и NSIS.
# Запуск: bash build-windows-linux.sh · Результат: builds/Luma_<версия>_x64-setup.exe
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
TC="$ROOT/.tools/win-gnu"
SR="$TC/sysroot"
RUST=/usr/lib/rust-1.91
SUDO=""; [ "$(id -u)" = 0 ] || SUDO=sudo

echo "▶ Пакеты: Rust 1.91, исходники std, MinGW-w64, NSIS"
$SUDO apt-get install -y rustc-1.91 cargo-1.91 rust-1.91-src \
  gcc-mingw-w64-x86-64-posix g++-mingw-w64-x86-64-posix binutils-mingw-w64-x86-64 mingw-w64-x86-64-dev nsis

if [ ! -f "$SR/.ready" ]; then
  echo "▶ Готовлю sysroot с std для x86_64-pc-windows-gnu"
  rm -rf "$TC"
  mkdir -p "$SR/lib/rustlib/x86_64-pc-windows-gnu/lib" "$SR/lib/rustlib/src/rust" "$TC/bin"
  ln -s "$RUST/lib/rustlib/x86_64-unknown-linux-gnu" "$SR/lib/rustlib/x86_64-unknown-linux-gnu"
  cp -a "$RUST/lib/rustlib/src/rust/library" "$SR/lib/rustlib/src/rust/library"
  # Ubuntu вырезает из std зависимость под Windows (debian/patches/prune/d-0020-remove-windows-dependencies.patch) — возвращаем.
  python3 - "$SR/lib/rustlib/src/rust/library" <<'EOF'
import pathlib, sys
lib = pathlib.Path(sys.argv[1])
std = lib / "std/Cargo.toml"
s = std.read_text()
if "dependencies.windows-targets" not in s:
    s = s.replace("[dev-dependencies]", "[target.'cfg(any(windows, target_os = \"cygwin\"))'.dependencies.windows-targets]\npath = \"../windows_targets\"\n\n[dev-dependencies]", 1)
    s = s.replace("windows_raw_dylib = []", "windows_raw_dylib = [\"windows-targets/windows_raw_dylib\"]", 1)
    std.write_text(s)
sysroot = lib / "sysroot/Cargo.toml"
sysroot.write_text(sysroot.read_text().replace("windows_raw_dylib = []", "windows_raw_dylib = [\"std/windows_raw_dylib\"]", 1))
EOF
  # Стартовые объекты, которые обычно приходят вместе с rust-std для windows-gnu
  for f in rsbegin rsend; do
    RUSTC_BOOTSTRAP=1 rustc-1.91 --target x86_64-pc-windows-gnu --emit=obj -C panic=abort -O \
      -o "$SR/lib/rustlib/x86_64-pc-windows-gnu/lib/$f.o" "$SR/lib/rustlib/src/rust/library/rtstartup/$f.rs"
  done
  printf '#!/bin/sh\nexec /usr/bin/rustc-1.91 --sysroot "%s" "$@"\n' "$SR" > "$TC/bin/rustc"
  chmod +x "$TC/bin/rustc"
  ln -sf /usr/bin/cargo-1.91 "$TC/bin/cargo"
  touch "$SR/.ready"
fi

# rustup убираем из PATH: иначе Tauri CLI спрашивает у него список целей, а не смотрит в sysroot
export PATH="$TC/bin:$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '/\.cargo/bin$' | paste -sd:)"
export RUSTC="$TC/bin/rustc" RUSTC_BOOTSTRAP=1 CARGO_UNSTABLE_BUILD_STD=std,panic_abort
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc CI=true

[ -d node_modules ] || npm ci --no-audit --no-fund
echo "▶ Собираю Windows-установщик"
npx tauri build --target x86_64-pc-windows-gnu --bundles nsis
mkdir -p builds
cp -f src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/*.exe builds/
ls -lh builds/*.exe
