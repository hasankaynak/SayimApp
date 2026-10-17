@echo off
set BUILD_TOOLS=C:\Users\hkk02\AppData\Local\Android\Sdk\build-tools\35.0.0
set ORIG_APK=android\app\build\outputs\apk\release\app-release.apk
set ALIGNED_APK=android\app\build\outputs\apk\release\app-release-aligned.apk
set FINAL_APK=SayimApp.apk

if exist %ALIGNED_APK% del /f /q %ALIGNED_APK%

echo [1/3] Running zipalign...
"%BUILD_TOOLS%\zipalign.exe" -v -p 4 %ORIG_APK% %ALIGNED_APK%

echo [2/3] Running apksigner...
call "%BUILD_TOOLS%\apksigner.bat" sign --ks android\app\debug.keystore --ks-pass pass:android --key-pass pass:android --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out %FINAL_APK% %ALIGNED_APK%

echo [3/3] Verifying signature...
call "%BUILD_TOOLS%\apksigner.bat" verify --verbose %FINAL_APK%

copy /y %FINAL_APK% ..\SayimApp.apk
echo All steps completed successfully!
