#!/bin/bash

set -x

HOSTNAME=$(hostname | tr -d '\n')

echo "HOSTNAME: -->$HOSTNAME<--"


BOOT_DIR="/boot"
if lsblk | grep -q /boot/firmware; then
    BOOT_DIR="/boot/firmware"
fi

WEBTHINGS_HOME="${WEBTHINGS_HOME:=${HOME}/.webthings}"
SSL_DIR="${WEBTHINGS_HOME}/ssl"
[ ! -d "${SSL_DIR}" ] && mkdir -p "${SSL_DIR}"
#openssl genrsa -out "${SSL_DIR}/privatekey.pem" 2048

current_year=$(date +%Y)
#future_year=$(($current_year + 10))

if [ -f "$BOOT_DIR/candle_ssl_2048.txt" ]; then
	openssl genrsa -out "${SSL_DIR}/privatekey.pem" 2048
elif [ -f "$BOOT_DIR/candle_ssl_3072.txt" ]; then
	openssl genrsa -out "${SSL_DIR}/privatekey.pem" 3072
elif [ -f "$BOOT_DIR/candle_ssl_4096.txt" ]; then
	openssl genrsa -out "${SSL_DIR}/privatekey.pem" 4096

elif [ "$current_year" -gt 2028 ]; then
	if [ "$current_year" -gt 2032 ]; then
		openssl genrsa -out "${SSL_DIR}/privatekey.pem" 4096
	else
		openssl genrsa -out "${SSL_DIR}/privatekey.pem" 3072
	fi
else
	openssl genrsa -out "${SSL_DIR}/privatekey.pem" 2048
fi

#openssl req -new -sha256 -key "${SSL_DIR}/privatekey.pem" -out "${SSL_DIR}/csr.pem" -subj '/CN=www.sgnihtbew.com/O=WebThings Gateway/C=US'
openssl req -new -sha256 -key "${SSL_DIR}/privatekey.pem" -out "${SSL_DIR}/csr.pem" -subj "/CN=$HOSTNAME.local/O=Candle/C=NL"
openssl x509 -req -days 3650 -in "${SSL_DIR}/csr.pem" -signkey "${SSL_DIR}/privatekey.pem" -out "${SSL_DIR}/certificate.pem"
openssl x509 -outform der -in "${SSL_DIR}/certificate.pem" -out "${SSL_DIR}/certificate.crt"


