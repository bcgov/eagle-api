#################################################
# 
# Usage: 
#   Generate 10 projects       ./generate.sh
#   Generate 100 projects      ./generate.sh 100
#
# This script calls a data generation
# utility built using the jest test suite.
# It uses factories so that data generation
# stays up to date with the models and happens
# as code.
# 
#################################################

PROJECTS=10;
if [ ! -z "${1}" ]; then PROJECTS=$1; fi
rm -f ./generate_num.config;
echo "$PROJECTS" > generate_num.config;
node_modules/.bin/jest ./api/test/generate.test.js
