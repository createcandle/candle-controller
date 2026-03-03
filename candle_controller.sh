#!/bin/bash
#set -e -x

if [ -f /dev/kmsg ]; then
  echo "in run-app.sh: starting gateway" | sudo tee -a /dev/kmsg
fi
echo "Preparing the Candle Controller for launch"


NVM_DIR="/home/pi/.nvm"	
source $NVM_DIR/nvm.sh


#CONTROLLER_NODE_VERSION_FILE_PATH="${WEBTHINGS_HOME}/.node_version"
use_node_version=$(node --version | egrep -o '[0-9]+' | head -n1)
echo "run-app.sh: use_node_version: $use_node_version"

#AVAILABLE_NODE_VERSIONS=$(nvm list | grep  "lts/" | grep -v "N/A")
#echo
#echo "Installed node versions: "
#echo "${AVAILABLE_NODE_VERSIONS}"
#echo


# Optionally let the desired Node version be overridden with a file in /boot	
if [ -f "/boot/firmware/candle_node_version.txt" ]; then	
  use_node_version=$(cat /boot/firmware/candle_node_version.txt)	
  echo "Candle node version file detected. overriding Node version to use to: ${use_node_version}"	
fi	


WEBTHINGS_HOME="${WEBTHINGS_HOME:=${HOME}/.webthings}"	
mkdir -p "${WEBTHINGS_HOME}/log"	
if [ -f "${WEBTHINGS_HOME}/log/run-app.log" ]; then
  rm -f "${WEBTHINGS_HOME}/log/run-app.log"
fi


echo
echo "Starting Candle Controller!"	
echo "Node version: $use_node_version"
echo	
nvm exec ${use_node_version} node build/app.js

