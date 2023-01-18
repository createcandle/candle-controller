#!/bin/bash
#set -e -x

echo "in run-app.sh: starting gateway" >> /dev/kmsg
echo "Preparing the Candle Controller for launch"

# Paths
NVM_DIR="/home/pi/.nvm"
WEBTHINGS_HOME="${WEBTHINGS_HOME:=${HOME}/.webthings}"
CONTROLLER_NODE_VERSION_FILE_PATH="${WEBTHINGS_HOME}/.node_version"

# Make NVM available in this script
source $NVM_DIR/nvm.sh

# Get default Node version as reported by a call to Node --version
_node_version=$(node --version | egrep -o '[0-9]+' | head -n1)
echo "Current default Node version: ${_node_version}"


# What version the controller is (allegedly) currently built to use
_current_controller_version=$(cat ${CONTROLLER_NODE_VERSION_FILE_PATH})
_desired_controller_version=$(cat ${CONTROLLER_NODE_VERSION_FILE_PATH})

# Display available node versions
AVAILABLE_NODE_VERSIONS=$(nvm list | grep  "lts/" | grep -v "N/A")
echo
echo "Installed node versions: "
echo "${AVAILABLE_NODE_VERSIONS}"
echo
# Out of curiosity, figure out what the latest available installed Node version actually is
#_newest_available_node_version_line=$(nvm list | grep  "lts/" | grep -v "N/A" | tail -n1 | egrep -o '[0-9]+' | head -n1)
#_newest_available_node_version=$(echo "$_newest_available_node_version_line" | egrep -o '[0-9]+' | head -n1)
#echo "_newest_available_node_version: $_newest_available_node_version"


# Optionally let the desired Node version be overridden with a file in /boot
if [ -f "/boot/candle_node_version.txt" ]; then
  _desired_controller_version=$(cat /boot/candle_node_version.txt)
  echo "Candle node version file detected. Will use Node version: ${_desired_controller_version}"
fi

#echo "NODE_VERSION_FILE_PATH: ${NODE_VERSION_FILE_PATH}"
echo "CURRENT CONTROLLER NODE VERSION: ${_current_controller_version}"
echo "DESIRED CONTROLLER NODE VERSION: ${_desired_controller_version}"


# Clear logs
mkdir -p "${WEBTHINGS_HOME}/log"
if [ -f "${WEBTHINGS_HOME}/log/run-app.log" ]; then
  rm -f "${WEBTHINGS_HOME}/log/run-app.log"
fi


# If somehow the .node_version file is missing, set the desired Node version as the current system default
if [[ ! -f "${WEBTHINGS_HOME}/.node_version" ]]; then
  echo "WARNING: .node_version file was missing!"
  _desired_controller_version=${_node_version}
fi

# Check if big changes need to be made
if [[ ${_desired_controller_version} != ${_current_controller_version} ]]; then

  # rebuild the controller
  echo
  echo "REBUILDING THE CONTROLLER!"
  if [ -f /dev/kmsg ]; then
    echo "Candle: run-app.sh: REBUILDING THE CONTROLLER!" >> /dev/kmsg
  fi
  if [ -f /boot/candle_log.txt ]; then
    echo "Candle: run-app.sh: rebuilding the controller" >> /boot/candle_log.txt
  fi
  echo
  nvm use ${_desired_controller_version}
  nvm alias default ${_desired_controller_version}
  npm rebuild

  # TODO: here the system Node default is being set. That might interfere with 
  # older addons that are assuming the system runs on Node 10 or 12

  # Remember which version the controller is now rebuilt as
  echo "${_desired_controller_version}" > "${WEBTHINGS_HOME}/.node_version"


  # Update the addons too (not sure if this currently works)
  #echo "ATTEMPTING ADDONS UPDATE"
  #cd "${HOME}/webthings/gateway"
  #mkdir -p "${WEBTHINGS_HOME}/config"
  #./tools/update-addons.sh
  #cd -

else
  echo "OK"
fi

echo
echo "Starting Candle Controller!"
echo
nvm exec ${_desired_controller_version} node build/app.js
