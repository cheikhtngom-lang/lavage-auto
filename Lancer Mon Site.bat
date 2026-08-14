@echo off
title Lavage Auto - Demarrage
color 0B
cd /d "%~dp0"

echo =========================================
echo       LANCEMENT DU SITE LAVAGE AUTO
echo =========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERREUR : Node.js n'est pas installe sur cet ordinateur.
    echo.
    echo 1. Allez sur https://nodejs.org/
    echo 2. Telechargez et installez la version recommandee.
    echo 3. Relancez ce fichier.
    pause
    exit /b
)

if not exist "node_modules" (
    echo Premiere installation des librairies, patientez quelques instants...
    call npm install
    echo.
)

echo Demarrage du serveur en arriere-plan...
start "Serveur Lavage Auto - NE PAS FERMER" cmd /k npm run dev

echo Attente que le site soit pret...
set count=0
:waitloop
set /a count+=1
curl -s -o nul http://localhost:5173
if not errorlevel 1 goto ready
if %count% GEQ 30 goto ready
timeout /t 1 /nobreak >nul
goto waitloop

:ready
start "" "http://localhost:5173/"

echo.
echo =========================================
echo   Le site vient de s'ouvrir dans votre navigateur !
echo   Vous pouvez fermer cette fenetre.
echo   (La fenetre noire "Serveur Lavage Auto" doit
echo   rester ouverte tant que vous utilisez le site.
echo   Utilisez "Arreter Site.bat" pour tout arreter.)
echo =========================================
pause
