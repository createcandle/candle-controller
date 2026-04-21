#!/bin/bash -e

set -x

cat >> "${ROOTFS_DIR}/boot/config.txt" <<END

# Uncomment some or all of these to enable the optional hardware interfaces
dtparam=i2c_arm=on
#dtparam=i2s=on
dtparam=spi=on

# Seeed Voicecard support
#dtoverlay=i2s-mmap
dtparam=i2s=on
#dtoverlay=seeed-2mic-voicecard
# dtoverlay are apparently no longer needed. E.g. i2s-mmap is always enabled now.

# Enable audio (loads snd_bcm2835)
dtparam=audio=on

# Additional overlays and parameters are documented
# /boot/firmware/overlays/README

# Automatically load overlays for detected cameras
camera_auto_detect=1

# Automatically load overlays for detected DSI displays
display_auto_detect=1

# Automatically load initramfs files, if found
#auto_initramfs=1

# Enable DRM VC4 V3D driver
dtoverlay=vc4-kms-v3d
max_framebuffers=2

[pi0]
dtoverlay=pwm,pin=13

[pi3]
dtoverlay=vc4-kms-v3d

[pi4]
dtoverlay=vc4-kms-v3d-pi4

[pi5]
dtoverlay=vc4-kms-v3d-pi5

[pi6]
dtoverlay=vc4-kms-v3d-pi6

# Don't have the firmware create an initial video= setting in cmdline.txt.
# Use the kernel's default instead.
disable_fw_kms_setup=1

# Run in 64-bit mode
arm_64bit=1

# Disable compensation for displays with overscan
disable_overscan=1

# Run as fast as firmware / board allows
arm_boost=1

[cm4]
# Enable host mode on the 2711 built-in XHCI USB controller.
# This line should be removed if the legacy DWC2 controller is required
# (e.g. for USB device mode) or if USB support is not required.
otg_mode=1

[cm5]
dtoverlay=dwc2,dr_mode=host

[all]

# Read only mode
initramfs initrd followkernel
ramfsfile=initrd
ramfsaddr=-1
disable_splash=1



# DO NOT PLACE ANYTHING BELOW POWER_SETTINGS_START LINE, IT MAY BE REMOVED BY THE POWER SETTINGS ADDON

#POWER_SETTINGS_START

END

cat >> "${ROOTFS_DIR}/etc/modules" <<END

i2c-dev
END
