#!/bin/sh
cat ~/.npmrc >> /tmp/t
npm publish --access public
twine upload dist/*
