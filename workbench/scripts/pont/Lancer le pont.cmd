@echo off
chcp 65001 >nul
title Pont local MASSAMBA (REA et ce PC pour la Workbench)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe sur ce PC.
  echo  Installez la version LTS ^(22 ou plus^), puis double-cliquez de nouveau sur ce fichier.
  start "" https://nodejs.org/fr/download
  pause
  exit /b 1
)
rem Glissez un dossier sur ce fichier pour le donner a l'agent ; sans dossier : le dossier de l'application.
node massamba-pont.mjs %*
pause
