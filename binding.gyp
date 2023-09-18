{
  "targets": [
    {
        "target_name": "realsense",
        "sources": [],
        "defines": [],
        "cflags": ["-std=c++11", "-Wall", "-pedantic", "-O3"],
        "include_dirs": [ 
          "<!(node -p \"require('node-addon-api').include_dir\")",
        ],
        "libraries": [],
        "dependencies": [],
        "conditions": [
            ['OS=="win"', {
              "sources": [ "realsense.cpp" ],
              'include_dirs': [
                "C:\\Program Files (x86)\\Intel RealSense SDK 2.0\\include",
				"."
              ],
              'library_dirs': [
                'C:\\Program Files (x86)\\Intel RealSense SDK 2.0\\lib\\x64',
              ],
              'libraries': [
                '-lrealsense2.lib'
              ],
              'msvs_settings': {
                'VCCLCompilerTool': { 'ExceptionHandling': 1 }
              },
              "copies": [{
                'destination': './build/<(CONFIGURATION_NAME)/',
                'files': ['C:\\Program Files (x86)\\Intel RealSense SDK 2.0\\bin\\x64\\realsense2.dll']
              }]
            }],
            ['OS=="mac"', {
              'cflags+': ['-fvisibility=hidden'],
              'xcode_settings': {},
            }],
            ['OS=="linux"', {}],
        ],
    }
  ]
}