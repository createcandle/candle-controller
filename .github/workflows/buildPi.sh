name: Build image and OTA update

on: 
  workflow_dispatch:
    inputs:
      logLevel:
        description: 'Log level'     
        required: true
        default: 'warning'
      tags:
        description: 'Build PI'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install qemu
        run: |
          sudo apt update
          sudo apt install -y qemu qemu-user-static binfmt-support --no-install-recommends
      - name: Setup qemu-user-static
        run: docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
      - name: Build the image
        run: |
          cd image
          ./build.sh
