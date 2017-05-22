import os
from setuptools import setup


def package_data(pkg, roots):
    """Generic function to find package_data.

    All of the files under each of the `roots` will be declared as package
    data for package `pkg`.

    """
    data = []
    for root in roots:
        for dirname, _, files in os.walk(os.path.join(pkg, root)):
            for fname in files:
                data.append(os.path.relpath(os.path.join(dirname, fname), pkg))

    return {pkg: data}


setup(
    name='videofront-xblock',
    version='0.1',
    description='XBlock for videos stored on a Videofront server',
    packages=[
        'videofront_xblock',
    ],
    install_requires=[
        'XBlock', 'xblock-utils', 'requests'
    ],
    entry_points={
        'xblock.v1': [
            'videofront-xblock = videofront_xblock:VideofrontXBlock',
        ]
    },
    package_data=package_data("videofront_xblock", ["static", "public"]),
)
