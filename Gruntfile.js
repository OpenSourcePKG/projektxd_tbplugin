const webpackConfig = require('./webpack.config.js');

module.exports = (grunt) => {
    const outDir = 'built/';
    const outDirExtracted = 'dist/';

    const manifestJSONContent = grunt.file.readJSON('assets/manifest.json');

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        manifest: manifestJSONContent,
        clean: {
            built: `${outDir}`,
            dist: `${outDirExtracted}`
        },
        exec: {
            tsc: '"npm run tsc'
        },
        copy: {
            main: {
                files: [
                    {
                        expand: true,
                        cwd: 'assets/',
                        // src: ['**/*.{json,html}'],
                        src: ['**/*'],
                        dest: outDirExtracted
                    }
                ]
            }
        },
        webpack: {
            dev: webpackConfig,
            release: webpackConfig.map((config) => Object.assign({}, config, {
                mode: 'production'
            }))
        },
        compress: {
            main: {
                options: {
                    archive: `${outDir}/projektXD-${manifestJSONContent.version}.xpi`,
                    mode: 'zip'
                },
                files: [
                    {
                        expand: true,
                        cwd: outDirExtracted,
                        src: ['**'],
                        dest: '/'
                    }
                    // makes all src relative to cwd
                ]
            }
        }
    });

    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-compress');
    grunt.loadNpmTasks('grunt-webpack');

    grunt.registerTask('default', [
        'clean:built',
        'clean:dist',
        'copy',
        'webpack:release',
        'compress'
    ]);
};