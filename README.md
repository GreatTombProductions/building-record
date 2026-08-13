# The Building's Record — Chicago

Every permit, violation, food inspection and business license the City of Chicago has on file for a building — searchable by street address. Free, static, no signup, every record source-linked.

## Data Sources
- Building Permits — https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu
- Building Violations — https://data.cityofchicago.org/Buildings/Building-Violations/22u3-xenr
- Food Inspections — https://data.cityofchicago.org/Health-Human-Services/Food-Inspections/4ijn-s7e5
- Business Licenses — https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr

## How to rebuild
```bash
cd pipeline
python3 fetch.py    # download the four datasets (paginated, resume-safe)
python3 build.py    # normalize addresses, join, emit data/generated/
cd ..
./deploy.sh         # push static snapshot to gh-pages
```

MIT License.
