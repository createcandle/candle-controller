# Candle Controller (Webthings Gateway)

This is a version of the Webthings Gateway, with some minor modifications. If you want to manually install this, check out the steps at:

https://github.com/webthingsio/gateway




# Creating the full disk image
The list below is a work in progress! Reboot between steps.

- Follow the steps to create a Webthings Raspberry Pi disk image, but use this repository instead of the Webthings Gateway one. Candle does have some differences, as it uses the latest version of the Raspberry Pi OS with Python 3.9. 

Candle also uses a newer version of Node, Node 12, by calling `nvm install 12`. Node 14 is probably also possible. This tutorial explains well how Node can be updated: https://medium.com/@thedyslexiccoder/how-to-update-nodejs-npm-on-a-raspberry-pi-4-da75cad4148c

During this process SQlite may be problematic. You may need to build it from scratch using `npm install sqlite3 build-from-source --python=/usr/bin/python3`. See:
https://github.com/mapbox/node-sqlite3/issues/906

This fix may also be required:
https://github.com/WebThingsIO/gateway/commit/90a6fb9966458fc3b6d1e3190f2c432e4a727f54

TODO: There may be some additional small changes needed to the Candle Controller code to make it compatible with the newer version of sqlite.

Webpack might not have enough memory if you run the `build` part on a raspberry pi, in which case you can use this command instead:
`node --max-old-space-size=2048 node_modules/webpack/bin/webpack.js`

TODO: Note that is may be possible to simplify things here by extracting the changes that the Webthings Gateway makes to the Raspbian Lite image. For example, the IP-tables rules would need to be extracted, and some packages would need to be installed, but it should be doable.



### Installing additional software

Next, install BlueAlsa from source, following the steps on the github page but using this configuration command: `../configure --enable-msbc --enable-mp3lame --enable-faststream`. See:
https://github.com/Arkq/bluez-alsa/wiki/Installation-from-source

Also install the ReSpeaker drivers from the HinTak fork:
https://github.com/HinTak/seeed-voicecard


### Splitting the partition

Next, the goal is to split the partition into a read-only and a read-write part. Everything under /home/pi/.webthings will become read-write.
- You will probably want to (temporarily) disable the webthings gateway systemd process from starting.
- Make the main system partition smaller (about 4Gb should be fine), and create a new Ext4 user partition of 10Gb. The system partition will be read-only in the end, while the user partition will remain read-write. Don't fill up the new user partition to the maximum of the SD card, as not all SD cards have as much space, so it's good to keep some empty space at the end of the disk.
- You will probably want to modify /etc/fstab at this point so that the new partition is mounted as /home/pi/.webthings.

  First, temporarily rename /home/pi/.webthings to something else, e.g. /home/pi/.webthings-backup
  Then modify fstab so that the partition is mounted at /home/pi/.webthings. Something like:
  `PARTUUID=93bd8c27-03  /home/pi/.webthings  ext4    defaults,rw  1       2` (where you modify the line to fit the existing PARTUUID data in the fstab file)
  
- After a reboot the user partition should be mounted as /home/pi/.webthings. You can now move the data from the backed-up .webthings directory into the new one, so that it now lives on the new user partition.


### Linking locations to the read-write partition
Once this works it's time to move many other system configuration files so that they are stored on /home/pi/.webthings .
- If you look inside /etc/fstab of the Candle configuration repository you will see that a number of locations are shifted to the read-write partition using bind:

/home/pi/.webthings/etc/wpa_supplicant  /etc/wpa_supplicant  none defaults,bind
/home/pi/.webthings/var/lib/bluetooth   /var/lib/bluetooth   none defaults,bind
/home/pi/.webthings/etc/ssh             /etc/ssh             none defaults,bind
/home/pi/.webthings/etc/hostname        /etc/hostname        none defaults,bind
/home/pi/.webthings/tmp                 /tmp                 none defaults,bind
/home/pi/.webthings/arduino/.arduino15  /home/pi/.arduino15  none defaults,bind
/home/pi/.webthings/arduino/Arduino     /home/pi/Arduino     none defaults,bind

All those locations need to exist and have the right permissions, otherwise fstab will fail and the system will not boot.
  
  Create two empty folders: `/home/pi/.arduino15` and `/home/pi/Arduino`. This will allow any Arduino installation to be installed on the read-write partition.
  Sudo copy everything from `/var/lib/bluetooth` into `/home/pi/.webthings/var/lib/bluetooth` and chown the new folder to be owned by root:root. 
  Create a `/home/pi/.webthings/tmp` folder that is owned by root:root
  Copy the rest of the data folders from the configuration repository. This includes the new fstab file. 
  
  Make sure that....
  `/home/pi/.webthings/tmp` directory  now exists and has root:root permission
  `/home/pi/.webthings/var/lib/bluetooth` directory now exists and has root:root permission
  `/home/pi/.webthings/etc/wpa_supplicant` directory now exists and has root:root permission
  `/home/pi/.webthings/etc/hostname` file now exists and has root:root permission
  `/home/pi/.webthings/etc/hosts` file now exists and has root:root permission
  `/home/pi/.webthings/etc/timezone` file now exists and has root:root permission
  `/home/pi/.webthings/etc/fake-hwclock.data` file now exists and has root:root permission

  `/etc/voicecard` should exist if the ReSpeaker drivers were installed

  Create symlinks:
  `/etc/hosts` should lead to `/home/pi/.webthings/etc/hosts`
  `/etc/fake-hwclock.data` should lead to `/home/pi/.webthings/etc/fake-hwclock.data`
  `/etc/timezone` should lead to `/home/pi/.webthings/etc/timezone`

- Run the install script from https://github.com/createcandle/install-scripts. This will enable things like Candle's systemd services, and install the kiosk mode. You may have to re-copy the chromium settings folder from the configuration repo in case the installation of chromium has overwritten those (privacy protecting) settings.
- Re-enable the Webthings systemd service

You should now have a working Candle system

### Creating a disk iamge
You can now run /home/pi/prepare_for_disk_image.sh. It will write zeros to all space, reset the database, and more. Once it's done you can take out the SD card and image it on your computer. It's recommended to use software that can only extract the actual partitions, like Win32DiskImager. This will give you a 14Gb disk image. Because the process writes zeros it compressed very well. Zip the image, and it will be about 1.2Gb.

For the official Candle disk image this process is done on a Raspberry Pi Zero 2 with a ReSpeaker hat. This is (somehow) needed to maek the image work on both normal Raspberry Pi and the Pi Zero.
