@echo off
title Envoi du code sur GitHub
color 0A

echo =========================================
echo       SAAS LAVAGE AUTO - GITHUB SYNC     
echo =========================================
echo.

echo Verification de Git...
git --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERREUR : Git n'est pas installe sur cet ordinateur !
    echo Veuillez l'installer depuis https://git-scm.com/
    pause
    exit /b
)

echo Initialisation/Verification du depot...
if not exist ".git" (
    git init
    echo [INFO] Depot Git initialise.
    
    echo.
    set /p url="Veuillez coller le lien de votre depot GitHub (ex: https://github.com/votre-nom/projet.git) : "
    git remote add origin %url%
)

echo.
echo Ajout de tous les nouveaux fichiers...
git add .

echo.
echo Creation de la sauvegarde (Commit)...
git commit -m "Mise a jour automatique - %date% %time%"

echo.
echo Envoi vers GitHub en cours...
git push -u origin main

if errorlevel 1 (
    echo.
    echo [ATTENTION] L'envoi direct sur la branche 'main' a echoue.
    echo Essai sur la branche 'master'...
    git push -u origin master
)

echo.
echo =========================================
echo   ENVOI TERMINE AVEC SUCCES !
echo =========================================
pause
