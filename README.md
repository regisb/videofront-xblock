# Videofront XBlock

This is an [Open edX XBlock](https://xblock.readthedocs.io/en/latest/) for playing videos stored on a [Videofront](https://github.com/regisb/videofront/) instance.

This XBlock was heavily inspired by the [FUN Videofront XBlock](https://github.com/openfun/fun-videofront-xblock).

## Install

    pip install -e https://github.com/regisb/videofront-xblock.git@master#egg=videofront-xblock

Add the xblock to your advanced modules in the Studio:

![Studio advanced settings](./config.png?raw=true) 

## Configuration

Set the following values in your Open edX settings:

    XBLOCK_SETTINGS['videofront-xblock'] = {
        'HOST': 'http://yourvideofront.com',
        'TOKEN': 'addyourvideofrontapitokenhere',
    }

## License

The code in this repository is licensed the Apache 2.0 license unless otherwise noted.

Please see `LICENSE` for details.
