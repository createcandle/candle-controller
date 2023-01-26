#!/bin/bash
#set -e -x

if [ -f /dev/kmsg ]; then
  echo "in run-app.sh: starting gateway" | sudo tee -a /dev/kmsg
fi
echo "Preparing the Candle Controller for launch"

# Paths


#CONTROLLER_NODE_VERSION_FILE_PATH="${WEBTHINGS_HOME}/.node_version"

# Make NVM available in this script

#source "$HOME/.nvm/nvm.sh"

# Get default Node version as reported by a call to Node --version
#use_node_version=$(node --version | egrep -o '[0-9]+' | head -n1)
#echo "Current default Node version: ${use_node_version}"

# Display available node versions
#AVAILABLE_NODE_VERSIONS=$(nvm list | grep  "lts/" | grep -v "N/A")
#echo
#echo "Installed node versions: "
#echo "${AVAILABLE_NODE_VERSIONS}"
#echo
# Out of curiosity, figure out what the latest available installed Node version actually is
#_newest_available_node_version_line=$(nvm list | grep  "lts/" | grep -v "N/A" | tail -n1 | egrep -o '[0-9]+' | head -n1)
#_newest_available_node_version=$(echo "$_newest_available_node_version_line" | egrep -o '[0-9]+' | head -n1)
#echo "_newest_available_node_version: $_newest_available_node_version"


# Clear logs
WEBTHINGS_HOME="${WEBTHINGS_HOME:=${HOME}/.webthings}"
mkdir -p "${WEBTHINGS_HOME}/log"
if [ -f "${WEBTHINGS_HOME}/log/run-app.log" ]; then
  rm -f "${WEBTHINGS_HOME}/log/run-app.log"
fi


#echo
#echo "Starting Candle Controller using Node version: $use_node_version"
#echo
#nvm exec ${use_node_version} node build/app.js

node build/app.js
