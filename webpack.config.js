const path = require('path');
const mode = process.env.NODE_ENV || 'development';
const outputPath = path.resolve(__dirname, 'dist');

const tsLoaderRules = [
    {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
    }
];

const extensions = [
    '.tsx',
    '.ts',
    '.js'
];

module.exports = [
    {
        name: 'webext',
        mode: mode,
        entry: {
            'background': `./src/chrome/background.ts`,
            'content/ui/options': './src/chrome/content/ui/options.ts',
            'content/scripts/login': './src/chrome/content/scripts/login.ts',
            'content/scripts/api': './src/chrome/content/scripts/api.ts',
        },
        experiments: {
            syncWebAssembly: true,
            topLevelAwait: true
        },
        output: {
            path: path.join(outputPath, 'chrome'),
            library: 'projektxdui',
            libraryExport: 'default'
            //filename: `${entry}.js`,
        },
        module: {
            rules: [
                ...tsLoaderRules
            ]
        },
        resolve: {
            extensions
        },
        optimization: {
            minimize: false
        }
    }/*,
    {
        name: 'experiment',
        mode,
        entry: './src/chrome/api/projektxd/implementation.ts',
        output: {
            filename: 'implementation.js',
            path: path.join(outputPath, 'chrome', 'api', 'projektxd'),
            library: 'projektxd',
            libraryExport: 'default'
        },
        module: {
            rules: [
                ...tsLoaderRules
            ]
        },
        resolve: {
            extensions
        },
        optimization:{
            minimize: false
        }
    }*/
];