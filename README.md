# accessibility-tests

Run in Windows from GitBash

## Prerequisites

nvm install 22
nvm use 22
npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"

Add to PATH:
C:\Users\Ruben\AppData\Local\nvm
C:\Program Files\nodejs

In the System variables section add

Variable name: NVM_HOME
Variable value: C:\Users\Ruben\AppData\Local\nvm

Variable name: NVM_SYMLINK
Variable value: C:\Program Files\nodejs

Install https://adoptium.net/ (Java runtime environment)
Install LibreOffice
  Go to https://portableapps.com/apps/office/libreoffice_portable
  Click Download from Publisher, Multilingual Standard
  Run executable
  Select "Remove additional languages" option
  Select this project directory as the installation target

## Install project

npm install

## Run tests

node ./test.js

