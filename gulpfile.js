var path = require('path');
var gulp = require('gulp');
var argv = require('yargs').argv;
gulp.jade = require('gulp-jade');
gulp.stylus = require('gulp-stylus');
gulp.bower = require('gulp-bower');
gulp.livereload = require('gulp-livereload');
gulp.NwBuilder = require('nw-builder');
gulp.jsonEditor = require('gulp-json-editor');
gulp.rename = require('gulp-rename');
gulp.uglify = require('gulp-uglify');
gulp.minifyCss = require('gulp-minify-css');
gulp.gm = require('gulp-gm');
gulp.mergeStreams = require('merge-stream');

var config = {
  env: argv.env || 'development',
  target: argv.target || 'nw',
};

var buildDir = './' + config.target;
var srcDir = './src';

// The default task simply runs all the compile tasks.
gulp.task('build', [
  'compile-html',
  'compile-css',
  'compile-js',
  'compile-bower',
  'process-data',
  'process-card-images'
], function () {
  if (config.target === 'overwolf') {
    gulp.src(srcDir + '/manifest.json').pipe(gulp.dest(buildDir));
  }
});

// Find all Jade templates and compile them into HTML.
gulp.task('compile-html', function () {
  var jadeOptions = {
    pretty: true,
    locals: {
      config: config,
      resolvePath: function (path) {
        switch (config.target) {
          case 'nw':
            return '.' + path;
          default:
            return path;
        }
      }
    }
  };

  // Compile the index file.
  var indexTemplate = gulp.src('./src/index.jade')
    .pipe(gulp.jade(jadeOptions))
    .pipe(gulp.dest(buildDir))
    .pipe(gulp.livereload());

  // Compile all other templates.
  var otherTemplates = gulp.src('./src/templates/**/*.jade')
    .pipe(gulp.jade(jadeOptions))
    .pipe(gulp.dest(buildDir + '/templates'))
    .pipe(gulp.livereload());
  
  return gulp.mergeStreams(indexTemplate, otherTemplates);
});

// Compile all Stylus files into proper CSS files.
gulp.task('compile-css', function () {
  // Compile all Stylus files.
  var styles = gulp.src('./src/css/**/*.styl')
    .pipe(gulp.stylus())
    .pipe(gulp.minifyCss())
    .pipe(gulp.dest(buildDir + '/css'))
    .pipe(gulp.livereload());

  return styles;
});

// Move all JavaScript files to the appropriate destination.
gulp.task('compile-js', function () {
  // Deploy all JavaScript files.
  var js = gulp.src('./src/js/**/*.js')
    //.pipe(gulp.uglify({mangle:false}))
    .pipe(gulp.dest(buildDir + '/js'))
    .pipe(gulp.livereload());

  return js;
});

// Move all bower libs to the built libs directory.
gulp.task('compile-bower', function () {
  // Deploy all bower dependencies.
  var libs = gulp.bower('./src/bower_components')
    .pipe(gulp.dest(buildDir + '/lib/'))
    .pipe(gulp.livereload());

  return libs;
});

// Move card images and generate thumbnails.
gulp.task('process-card-images', function () {
  // Copy all source images.
  var images = gulp.src('./src/imgs/**/*')
    .pipe(gulp.dest(buildDir + '/imgs/'))
    .pipe(gulp.livereload());

  // Crop card images to generate decklist thumbnails.
  var cardThumbnails = gulp.src('./src/imgs/cards/*')
    .pipe(gulp.gm(function (gmFile) {
      // API: gmFile.crop(width, height, x, y)
      return gmFile.crop(120, 40, 80, 110);
    }, { imageMagick: true }))
    .pipe(gulp.dest(buildDir + '/imgs/cards/thumbnails'))
    .pipe(gulp.livereload());

  return gulp.mergeStreams(images, cardThumbnails);
});

// Transform card data.
gulp.task('process-data', function () {
  // Transform card data into a flat array.
  var cardData = gulp.src('./src/data/all-sets.json').pipe(gulp.jsonEditor(function (cardSets) {
    var cards = [];
    Object.keys(cardSets).forEach(function (setName) {
      cards = cards.concat(cardSets[setName]);
    });
    var cardMap = {};
    cards.forEach(function (card) {
      cardMap[card.id] = card;
    });
    return cardMap;
  })).pipe(gulp.rename('cards.json')).pipe(gulp.dest(buildDir + '/data'));;

  return cardData;
});

// Run all compile tasks, start a livereload server, and add some watcher messages.
gulp.task('watch', ['build'], function () {
  // The change event is the same for all the watchers.
  var onChange = function (event) {
    var filePath = path.relative('./', event.path);
    console.log('%s %s', filePath, event.type);
  };

  // Detect changes to all relevant files and trigger the appropriate task.
  gulp.watch('./src/**/*.jade', ['compile-html']).on('change', onChange);
  gulp.watch('./src/css/**/*.styl', ['compile-css']).on('change', onChange);
  gulp.watch('./src/js/**/*.js', ['compile-js']).on('change', onChange);
  gulp.watch('./src/data/all-sets.json', ['process-data']).on('change', onChange);;
  gulp.watch('./src/data/decks/*', ['process-data']).on('change', onChange);;

  // Start livereload server to wait for piped filenames.
  gulp.livereload.listen({ basePath: buildDir });
});

// Run all compile tasks and then build executables for the application.
gulp.task('deploy', ['build'], function () {
  var files = [
    './package.json',
    buildDir + '/**/*'
  ];
  var packageInfo = require('./package.json');
  Object.keys(packageInfo.dependencies).forEach(function (dependencyName) {
    files.push('./node_modules/' + dependencyName + '/**/*');
  });

  // Instantiate Nwbuilder.
  var nw = new gulp.NwBuilder({
    version: '0.12.2',
    files: files,
    platforms: ['osx32', 'osx64', 'win32', 'win64'],
    buildDir: './release'
  });

  // If the builder fires a log event, log it to the console.
  nw.on('log',  console.log.bind(console));

  // Build returns a promise so that gulp can handle any errors it generates.
  return nw.build().then(function () {
     console.log('all done!');
  });
});
