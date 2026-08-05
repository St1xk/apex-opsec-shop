DROP YOUR ACTUAL PRODUCT FILES IN THIS FOLDER.

For each product in catalog.json with delivery.type = "file", the "file"
field must match a filename that exists in this directory.

Example:
  catalog.json says   "file": "pro-program.zip"
  You must place      ./data/products/pro-program.zip

For delivery.type = "redirect", no file needed — just set the url.
