#!/usr/bin/env bash
# Compile l'APK sans Android Studio ni SDK Android : tous les outils viennent de Maven Central
# (aapt2 via apktool, dx, apksig) et android.jar du dépôt Sable/android-platforms.
# Usage : ./build.sh            -> TelecommandeTV.apk
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
TOOLS="${TOOLS_DIR:-$ROOT/.build-tools}"
OUT="$ROOT/.build"
M=https://repo1.maven.org/maven2
mkdir -p "$TOOLS"

fetch() { [ -s "$TOOLS/$1" ] || curl -fsSL --retry 4 -o "$TOOLS/$1" "$2"; }
fetch apktool-cli.jar "$M/org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar"
fetch dx.jar          "$M/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar"
fetch apksig.jar      "$M/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar"
fetch android.jar     "https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar"
if [ ! -x "$TOOLS/aapt2" ]; then
  unzip -o -q -j "$TOOLS/apktool-cli.jar" prebuilt/linux/aapt2 -d "$TOOLS" && chmod +x "$TOOLS/aapt2"
fi
AAPT2="$TOOLS/aapt2"; ANDROID_JAR="$TOOLS/android.jar"

rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/signer"
SRC=app/src/main

echo "1/6 Ressources"
"$AAPT2" compile --dir "$SRC/res" -o "$OUT/res.zip"
"$AAPT2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$SRC/AndroidManifest.xml" \
  -A "$SRC/assets" --java "$OUT/gen" --min-sdk-version 21 --target-sdk-version 34 "$OUT/res.zip"

echo "2/6 Java"
javac -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 -bootclasspath "$ANDROID_JAR" \
  -d "$OUT/classes" $(find "$OUT/gen" "$SRC/java" -name '*.java')

echo "3/6 Dex"
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=21 \
  --output="$OUT/classes.dex" "$OUT/classes"

echo "4/6 Assemblage"
python3 - "$OUT/base.apk" "$OUT/classes.dex" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(sys.argv[2], 'classes.dex')
PY
python3 tools/zipalign.py "$OUT/base.apk" "$OUT/aligned.apk"

echo "5/6 Signature (v1 avec jarsigner, v2 avec apksig)"
KEYSTORE=${KEYSTORE:-debug.keystore}
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass android -keypass android \
    -alias telecommande -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Telecommande TV, O=Debug, C=SN" >/dev/null 2>&1
fi
jarsigner -keystore "$KEYSTORE" -storepass "${KEYSTORE_PASS:-android}" -sigalg SHA256withRSA \
  -digestalg SHA-256 -sigfile CERT "$OUT/aligned.apk" telecommande >/dev/null
python3 tools/zipalign.py "$OUT/aligned.apk" "$OUT/v1.apk"
javac -nowarn -cp "$TOOLS/apksig.jar" -d "$OUT/signer" tools/ApkSign.java
# apksig 2.3.0 touche des classes internes du JDK au chargement
JDK_OPENS="--add-exports=java.base/sun.security.x509=ALL-UNNAMED --add-exports=java.base/sun.security.pkcs=ALL-UNNAMED --add-exports=java.base/sun.security.util=ALL-UNNAMED"
java $JDK_OPENS -cp "$TOOLS/apksig.jar:$OUT/signer" ApkSign "$KEYSTORE" "${KEYSTORE_PASS:-android}" telecommande \
  "$OUT/v1.apk" TelecommandeTV.apk

echo "6/6 Vérification"
python3 tools/zipalign.py --check TelecommandeTV.apk
ls -l TelecommandeTV.apk
