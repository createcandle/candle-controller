1: sudo apt update

2: sudo apt install \
    autoconf \
    build-essential \
    curl \
    git \
    libbluetooth-dev \
    libboost-python-dev \
    libboost-thread-dev \
    libffi-dev \
    libglib2.0-dev \
    libpng-dev \
    libudev-dev \
    libusb-1.0-0-dev \
    pkg-config \
    python-six \
    node \
    python3-pip

3: sudo -H python3 -m pip install git+https://github.com/WebThingsIO/gateway-addon-python#egg=gateway_addon

4: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash

5: . ~/.bashrc

6: sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

7: sudo setcap cap_net_raw+eip $(eval readlink -f `which python3`)

8: git clone https://github.com/WebThingsIO/gateway.git #TODO change it for candle controller

9: cd gateway

10: nvm install

11: nvm use

12: nvm alias default $(node -v)

13: npm ci

14: npm start
