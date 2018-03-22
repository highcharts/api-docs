# api-docs
Generator for API documentation based on output from the Highcharts JSDoc plugin

# Folders

`templates/` - handlebars templates
`include/` - contents is copied over to the output

## Usage

#### Shortcut:
When running the `highcharts` repo, run `gulp jsdoc --watch`. It will pull in this repo and start a local server with the docs.


#### Detailed:

    npm install
    sudo npm link

Then run `hc-gen-api-docs <input.json> <outputpath/>` in a termnial, or `bin/gen.docs.js`.

```
OPTIONS:
  --platform      Define which platform were building for. e.g 'Android', 'iOS', or 'JS' - default: 'JS'.
  --products      Define which products to build. - default: "highcharts,highstock,highmaps".
  --allVersions   Build all versions. - default: false.
```

A server is automagically started on port 9700 to serve up the docs.
The server listens to changes on files in `include` and `templates`, and rebuilds
the docs if there are any. This only works if the ouput folder is a folder - `docs/` - in the project root.

This is to decrease turn-around time when working on design etc.


## Generated files

Files are generated in a hierarchy as such:

  - product_name
    - version 1
    - version 2

The root `product_name` folder contains the documentation for the latest sources.

Each property with one or more child properties get its own HTML file.

In addition, JSON files for each property with children gets a slim JSON file
in the `nav/` folder, for use with the navigation tree.

Each folder also gets its own `products.json`, which contains the required information
for implementing a version picker in the UI:

         {
          "activeProduct": "highcharts",
          "activeVersion": "current",
          "library": {
            "highcharts": {
              "current": "./",
              "1.2.4": "./../1.2.4/",
              "1.2.3": "./../1.2.3/"
            },
            "highstock": {
              "current": "./../highstock/",
              "1.2.4": "./../highstock/1.2.4/",
              "1.2.3": "./../highstock/1.2.3/"
            },
            "highmaps": {
              "current": "./../highmaps/"
            }
          }
        }

The version paths are relative to the current folder.

# License

Please see [the license file](LICENSE).
