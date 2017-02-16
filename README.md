# api-docs
Generator for API documentation based on output from the Highcharts JSDoc plugin

# Folders

`templates/` - handlebars templates
`include/` - contents is copied over to the output

## Usage

As usual:

    npm install
    sudo npm link

Then run `hc-gen-api-docs <input.json> <outputpath/>` in a termnial, or `bin/gen.docs.js`.

A server is automagically started on port 9700 to serve up the docs.
The server listens to changes on files in `include` and `templates`, and rebuilds
the docs if there are any. This only works if the ouput folder is a folder - `docs/` - in the project root.

This is to decrease turn-around time when working on design etc.

