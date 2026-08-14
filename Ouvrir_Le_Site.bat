@echo off
echo ===================================================
echo   DEMARRAGE DE VOTRE APPLICATION CLEAN CAR GALSEN
echo ===================================================
echo.
echo Le serveur est en train de demarrer...
echo Ne fermez pas cette fenetre noire pendant que vous utilisez le site.
echo.

:: Ouvre le navigateur sur la page d'accueil (React)
start "" "http://localhost:5173/index.html"

:: Lance le serveur de développement React
npm run dev
