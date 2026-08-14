@echo off
title Demarrage du SaaS Lavage Auto
color 0B

echo =========================================
echo       LANCEMENT DU SAAS LAVAGE AUTO      
echo =========================================
echo.

echo Verification de l'environnement (Node.js/NPM)...
call npm --version
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ========================================================
    echo ERREUR CRITIQUE : NODE.JS N'EST PAS INSTALLE !
    echo ========================================================
    echo Pour faire fonctionner ce SaaS haut de gamme (React), 
    echo votre ordinateur a besoin d'un moteur appele Node.js.
    echo.
    echo 1. Allez sur le site : https://nodejs.org/
    echo 2. Telechargez la version "Recommandee pour la plupart des utilisateurs"
    echo 3. Installez-la (Faites juste Suivant - Suivant - Terminer)
    echo 4. Une fois installe, relancez ce fichier !
    echo ========================================================
    pause
    exit /b
)

echo.
echo [1/2] Installation des librairies (Patientez quelques secondes la premiere fois)...
call npm install

echo.
echo [2/2] Demarrage du serveur de developpement...
echo.
echo ========================================================
echo NE FERMEZ PAS CETTE FENETRE NOIRE TANT QUE VOUS TESTEZ
echo ========================================================
echo.
call npm run dev
pause
