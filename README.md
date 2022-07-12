# Candle Controller (Webthings Gateway)

This is a version of the Webthings Gateway, with some minor modifications. If you want to manually install this, check out the steps at:

https://github.com/webthingsio/gateway




# Creating the full disk image
The list below is a work in progress! Reboot between steps.

- Follow the steps to create a Webthings Raspberry Pi disk image, but use this repository instead of the Webthings Gateway one.
- Make the main system partition smaller (about 4Gb should be fine), and create a new Ext4 user partition of 10Gb. The system partition will be read-only in the end, while the user partition will remain read-write.
- Copy everything from the configuration repository over. This will also replace the /etc/fstab file, which (among other things) will cause the user partition to be mounted as /home/pi/.webthings
- Run the install script from https://github.com/createcandle/install-scripts. This will enable things like systemd services.
