#!/bin/bash
echo "here we go"
#set -e -x
NVM_DIR="/home/pi/.nvm"
WEBTHINGS_HOME="${WEBTHINGS_HOME:=${HOME}/.webthings}"
_node_version=$(node --version | egrep -o '[0-9]+' | head -n1)


echo $NVM_DIR
source $NVM_DIR/nvm.sh


mkdir -p "${WEBTHINGS_HOME}/log"

if [ -f "${WEBTHINGS_HOME}/log/run-app.log" ]; then
  rm -f "${WEBTHINGS_HOME}/log/run-app.log"
fi


# If a new main version of Node is being used, update all the addons
if [[ ! -f "${WEBTHINGS_HOME}/.node_version" ||
        "$(< "${WEBTHINGS_HOME}/.node_version")" != "${_node_version}" ]]; then
  cd "${HOME}/webthings/gateway"
  mkdir -p "${WEBTHINGS_HOME}/config"
  ./tools/update-addons.sh
  cd -
  echo "${_node_version}" > "${WEBTHINGS_HOME}/.node_version"
fi


if [ -f /boot/candle_node12.txt ]; then
  if [[ _node_version != "12" ]]; then
    nvm use 12
    nvm alias default 12
    npm rebuild

    cd "${HOME}/webthings/gateway"
    mkdir -p "${WEBTHINGS_HOME}/config"
    ./tools/update-addons.sh
    cd -
    echo "12" > "${WEBTHINGS_HOME}/.node_version"
  fi

  nvm exec 12 node --version
  nvm exec 12 node build/app.js
else
  if [[ _node_version != "16" ]]; then
    nvm use 16
    nvm alias default 16
    npm rebuild

    cd "${HOME}/webthings/gateway"
    mkdir -p "${WEBTHINGS_HOME}/config"
    ./tools/update-addons.sh
    cd -
    echo "16" > "${WEBTHINGS_HOME}/.node_version"
  fi

  nvm exec 16 node --version
  nvm exec 16 node build/app.js
fi
