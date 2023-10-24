# tampermonkey-automation-scripts

- To make these scripts work better it is a good a practice to do the following thing in Tampermonkey:
  - Settings > Advanced > Downloads BETA
    - Download Mode: Browser API
    - Whitelisted File Extensions (append to the end): /^.*$/
  - Some scripts may download stuff. The above ensures that downloads can be properly managed within the script (Browser API) and allows your scripts to download any file, without exception (/^.*$/).
- To use any script, simply copy it's contents, add a new script in Tampermonkey, empty whatever code it gives you and paste the one from the script.
