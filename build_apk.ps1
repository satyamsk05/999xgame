$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH
flutter config --jdk-dir="$env:JAVA_HOME" | Out-Null

Write-Host "Building Release APK with Gradle 9.1 & Android Studio JBR..." -ForegroundColor Cyan
flutter build apk --release

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAPK BUILD SUCCESSFUL! 🎉" -ForegroundColor Green
    Write-Host "APK Location: build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor Cyan
} else {
    Write-Host "`nAPK Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
