#################################################
# 
# Usage: 
#   Generate 10 projects, without saving, making the same data every time       ./generate.sh
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
default_transient_data_mode="Unsaved";
persistent_data_mode="Saved";
DATA_MODE="${default_transient_data_mode}";
default_deterministic_seed_mode="Same";
random_seed_mode="Random";
SEED_MODE="${default_deterministic_seed_mode}";
usage="\n./generate.sh [the number of projects to generate] [$default_transient_data_mode (default) / $persistent_data_mode] [$default_deterministic_seed_mode (default) / $random_seed_mode]\n\nExamples:\n./generate.sh 10 $default_transient_data_mode $default_deterministic_seed_mode\n./generate.sh 3 $persistent_data_mode $random_seed_mode\n\n";
valid_numeric_pattern='^[0-9]+$';
valid_data_mode_pattern="^($default_transient_data_mode|$persistent_data_mode)+$";
valid_seed_mode_pattern="^($default_deterministic_seed_mode|$random_seed_mode)+$";
if [ ! -z "${3}" ]; then SEED_MODE=$3; fi
if [ ! -z "${2}" ]; then DATA_MODE=$2; fi
if [ ! -z "${1}" ]; then PROJECTS=$1; fi
# printf "PROJECTS: $PROJECTS\nDATA_MODE: $DATA_MODE\nSEED_MODE: $SEED_MODE\n"; 
if ! [[ "${PROJECTS}" =~ $valid_numeric_pattern ]]; then printf "$usage"; exit 1; fi
if ! [[ "${DATA_MODE}" =~ $valid_data_mode_pattern ]]; then printf "$usage"; exit 1; fi
if ! [[ "${SEED_MODE}" =~ $valid_seed_mode_pattern ]]; then printf "$usage"; exit 1; fi
JSON="{\"projects\":\"$PROJECTS\",\"data_mode\":\"$DATA_MODE\",\"seed_mode\":\"$SEED_MODE\"}\n";
# printf JSON;
rm -f ./generate.config;
printf "$JSON" > generate.config;
node_modules/.bin/jest ./api/test/generate.test.js
