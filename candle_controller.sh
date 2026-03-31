#!/bin/bash
#set -e -x

if [ -f /dev/kmsg ]; then
  echo "in candle_controller.sh: starting gateway" | sudo tee -a /dev/kmsg
fi
echo "Preparing the Candle Controller for launch"


NVM_DIR="/home/pi/.nvm"	
source $NVM_DIR/nvm.sh


#if [ ! -d /home/pi/.dbus/session-bus ]; then
#  export $(dbus-launch)
#fi

#echo "BEFORE:"
#echo "XDG_RUNTIME_DIR: $XDG_RUNTIME_DIR"
#echo "DBUS_SESSION_BUS_ADDRESS: $DBUS_SESSION_BUS_ADDRESS"
#echo "--"
#printenv
#echo "--"

if [ -n "$XDG_RUNTIME_DIR" ] ; then
  XDG_RUNTIME_DIR="/run/user/$(id -u)"
  DBUS_SESSION_BUS_ADDRESS="$XDG_RUNTIME_DIR/bus"
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
fi

if [ -n "$DBUS_SESSION_BUS_ADDRESS" ] ; then
  if [ -d /home/pi/.dbus/session-bus ] ; then
    SESSION_FILE=$(ls -tp /home/pi/.dbus/session-bus | grep -v /$ | head -1)
    if ps aux | grep -q '/dbus-daemon'; then
      if [ -n "$SESSION_FILE" ] && [ -f "/home/pi/.dbus/session-bus/$SESSION_FILE" ]; then
        echo "sourcing:  /home/pi/.dbus/session-bus/$SESSION_FILE"
        source "/home/pi/.dbus/session-bus/$SESSION_FILE"
      fi
    fi
  else
    echo "calling dbus-launch"
    export $(dbus-launch)
  fi
fi

#eval $(dbus-launch --sh-syntax)

if [ -n "$DISPLAY" ] ; then
  export DISPLAY=:0
fi


#XDG_RUNTIME_DIR="/run/user/1000"
#export XDG_RUNTIME_DIR="/run/user/1000"
#DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/1000/bus"
#export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/1000/bus"



#echo "AFTER:"
echo "XDG_RUNTIME_DIR: $XDG_RUNTIME_DIR"
echo "DBUS_SESSION_BUS_ADDRESS: $DBUS_SESSION_BUS_ADDRESS"
#echo "--"
#printenv
#echo "--"



# Ensure that the Candle Store addon is enabled
if [ ! -f "/boot/firmware/skip_candle_store_check.txt" ]; then	
  if [ -f /home/pi/.webthings/config/db.sqlite3 ]; then
    candleappstore_settings=$(sqlite3 /home/pi/.webthings/config/db.sqlite3 'SELECT value FROM settings WHERE key = "addons.candleappstore"')
    if [[ "$candleappstore_settings" == *",\"enabled\":false,"* ]]; then
      echo "Enabling candle store addon"
      echo "----BEFORE----"
      echo $candleappstore_settings
      echo "----"
    	new_candleappstore_settings="${candleappstore_settings//,\"enabled\":false,/,\"enabled\":true,}"
    	#new_candleappstore_settings="${new_candleappstore_settings//\"/\\\"}"
    	echo "----AFTER----"
    	echo $new_candleappstore_settings
    	echo "----"
    	sqlite3 /home/pi/.webthings/config/db.sqlite3 "UPDATE settings SET value='$new_candleappstore_settings' WHERE key IS 'addons.candleappstore';"
    else
    	echo "OK, Candle store is enabled"
    fi
  fi

  if [ ! -d "/home/pi/.webthings/addons/candleappstore" ] && [ -d "/home/pi/.webthings/backups/addons/candleappstore" ]; then	
    cp -r /home/pi/.webthings/backups/addons/candleappstore /home/pi/.webthings/addons/candleappstore
    chown -R pi:pi /home/pi/.webthings/addons/candleappstore
  fi

fi



#CONTROLLER_NODE_VERSION_FILE_PATH="${WEBTHINGS_HOME}/.node_version"
use_node_version=$(node --version | egrep -o '[0-9]+' | head -n1)
echo "candle_controller.sh: use_node_version: $use_node_version"

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

