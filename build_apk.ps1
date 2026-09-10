$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH
flutter config --jdk-dir="$env:JAVA_HOME" | Out-Null

Write-Host "Building Release APK with JDK 17..." -ForegroundColor Cyan
flutter build apk --release --android-skip-build-dependency-validation

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAPK BUILD SUCCESSFUL! 🎉" -ForegroundColor Green
    Write-Host "APK Location: build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor Cyan
} else {
    Write-Host "`nAPK Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
