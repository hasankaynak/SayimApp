@echo off
echo ================================================
echo Sayim APP - Otomatik APK Derleyici
echo ================================================
echo.
echo Lutfen Bekleyin... React Native Android projesi hazirlaniyor...
call npx expo prebuild
IF %ERRORLEVEL% NEQ 0 (
    echo [HATA] Prebuild islemi basarisiz oldu.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Android dizinine geciliyor ve Gradle Build baslatiliyor...
cd android
set ANDROID_HOME=C:\Users\hkk02\AppData\Local\Android\Sdk
call gradlew assembleRelease
IF %ERRORLEVEL% NEQ 0 (
    echo [HATA] Gradle build basarisiz oldu.
    cd ..
    pause
    exit /b %ERRORLEVEL%
)

cd ..
echo.
echo ================================================
echo BASARILI! APK BILGISI:
echo ================================================
echo APK Dosyasi: android\app\build\outputs\apk\release\app-release.apk
echo.
pause
