"use strict";
const admin = require('firebase-admin');
// const functions = require('firebase-functions');
const MediaWiki = require("mediawiki");

const cheerio = require('cheerio');
//to download files
var request = require('request');
var fs = require('fs-extra');

//SCRIPT TIME
var start = new Date()

//SET BOT
const bot = new MediaWiki.Bot();
bot.settings.endpoint = "https://www.lorenzobecchi.cloud/omp/api.php";
bot.settings.rate = 60e3 / 10;
bot.settings.userAgent = "ExampleBot <https://en.wiktionary.org/wiki/User:Example>";
bot.settings.byeline = "(example bot edit)";

//SET FIREBASE
var serviceAccount = require('../secret/one-minute-practice--firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  serviceAccount: 'google-services-omp.json', //this is file that I downloaded from Firebase Console
  authDomain: "one-minute-practice-180716.firebaseapp.com",
  databaseURL: 'https://one-minute-practice-180716.firebaseio.com'
});

//local setting
const wikiBaseURL = 'https://www.lorenzobecchi.cloud';

//parse Script Arguments
var argument;
var maxPages;
var pageTitle;
var promisses = [];
if (process.argv[2]) {
  argument = process.argv[2];
  // console.log('arg2',argument,typeof process.argv[2],Number.isInteger(process.argv[2]*2),Number.isInteger(42));
  if (Number.isInteger(process.argv[2] * 2)) {
    maxPages = process.argv[2];
    console.log('Requesting ' + maxPages + ' pages to the Wiki. Waiting to login...');

  } else if (typeof process.argv[2] === 'string') {
    pageTitle = process.argv[2];
    // console.log('argument is text');
    console.log('Requesting "' + pageTitle + '" page to the Wiki. Waiting to login...');

  }
  // process.exit();
} else {
  console.log('No argument provided:', 'Set a Digit for max records or a "String" for single page name');
  process.exit(1);
}

//LOGIN AND CALLS
bot.login('ominiverdi', 'bA^6SsSmACarVh5h+$KZ').complete(function (username) {
  // console.log("Logged in as " + username);
  // console.log('---------\n');
  console.log('Wiki logged \n');
  // console.log('---------\n');


  //CALLS

  if (maxPages) {
    updateAll(maxPages).then(data => {
      console.log('script ended successfully')
      var end = new Date() - start
      console.info('Elapsed time: %d s', end / 1000)
      //close the script
      setTimeout(()=>{
        process.exit(1);
      }, 100);
    }).catch(e => console.log('error', e)); //(limit integer). multi-page request
  }
  if (pageTitle) {
    updatePageFromTitle(pageTitle); //single page request
  }

  //UPDATE 1 PAGE
  // updatePageFromTitle('Estómago - Paso 0 - Estómago');


  //UPDATE ALL
  // updateAll(3000);//(l imit integer)


});



//FUNCTIONS
let downloads = [];



async function updateAll(limit) {
  //reset list of files to download
  downloads = [];
  //reset image collection on firebase
  admin.database().ref('/wikiImages').set(null);

  let promisses = [];

  let promise = await new Promise((resolve, reject) => {
    // setTimeout(() => resolve("done!"), 1000)

    bot.allpages('', limit).complete(function (allpages) {
      console.log('updateAll pages length:' + allpages.length);
      // admin.database().ref('pages-all' ).set(allpages);
      // console.log(allpages); //
      for (var i = 0; i < allpages.length; i++) {
        var page = allpages[i];
        // console.log('preparing page for upload: ', page.title)
        promisses.push(savePageOnFirebase(page));
        if (i == allpages.length - 1) {
          resolve(Promise.all(promisses));
        }
      }
    });
  });
  //
  //allpages(start,limit)
  // bot.allpages('', limit).complete(function (allpages) {
  //   console.log('updateAll pages length:' + allpages.length);
  //   // admin.database().ref('pages-all' ).set(allpages);
  //   // console.log(allpages); //
  //   for (var i = 0; i < allpages.length; i++) {
  //     var page = allpages[i];
  //     console.log('preparing page for upload: ', page.title)
  //     promisses.push(savePageOnFirebase(page));
  //     if (i == allpages.length - 1) {
  //       Promise.all(promisses).then(function (values) {
  //         console.log('Promise All values', values);
  //         return values;
  //       });
  //     }
  //   }
  // });

  let result = await promise; // wait till the promise resolves (*)
  return result;
  // alert(result); // "done!"

}


// let downloads = [];

function updatePageFromTitle(pageName) {
  // Wiki Bot login
  // bot.login('ominiverdi', 'bibi1973').complete(function (username) {
  // console.log("Logged in as " + username);
  // console.log('---------\n');
  // console.log('' +pageName+'\n');
  // console.log('---------\n');
  // Wiki Bot parse page
  promisses.push(bot.parse(pageName).complete(function (title, text, revid, categories, images, links, externallinks) {
    // console.log(text);
    console.log('---------');
    console.log(title);
    // console.log('---------');
    // console.log(categories);
    // console.log('---------');
    var output = {};
    output.title = title;
    output.rev = revid;
    output.content = text;
    // output.images = images;
    output.links = links;
    output.externallinks = externallinks;
    //reset categories tree
    output.categories = [];
    // console.log('-------');
    // console.log(title);
    for (var i = 0; i < categories.length; i++) {
      var category = categories[i]['*'];
      if (category != undefined) output.categories.push(category);
    };

    //clean the html
    const $ = cheerio.load(text, {
      decodeEntities: true
    });

    //parse images for download
    $('img').each(function (i, elem) {
      var imgSrc = $(this).attr('src');
      var imgSrcSet = $(this).attr('srcset');
      // donwload from imgSrc
      if (imgSrc != undefined) {
        // image imgSrc /omp/images/thumb/c/cd/Muneco_test.png/120px-Muneco_test.png
        // console.log('image imgSrc',imgSrc);

        //corregir el path en el HTML
        var aImgSrc = imgSrc.split('/');
        if (aImgSrc.length > 0) {
          // console.log('imgSrc',imgSrc);
          // download imgSrc
          if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
            var fullUrl = imgSrc;
          } else {
            var fullUrl = wikiBaseURL + imgSrc;
          }


          //...
          //get last part of the file name
          var fileName = aImgSrc[aImgSrc.length - 1];
          fileName = stringToFileName(decodeURI(fileName)).replace('.html', '').toLowerCase();
          //prepend the final path
          var imgSrc = '/images/mediawiki/' + fileName;
          var imgDestination = '../web_static/www/' + imgSrc;
          // console.log('file imgSrc downloads.push' ,fullUrl);
          // downloads.push(fullUrl);
          admin.database().ref('/wikiImages/' + fileName.replace('.', '_')).set(fullUrl);

          // download(fullUrl, imgDestination, function(){
          //   console.log('file copied: ' + imgDestination,fullUrl);
          //
          // });
        }

        //guardar cambios
        // console.log('imgSrc this: ',$(this));
        $(this).attr('src', imgSrc);
        // console.log('imgSrc updated: ',imgSrc);

      }
      // donwload from imgSrcSet
      if (imgSrcSet != undefined) {
        //define endSet
        var endSet = [];
        // image imgSrcSet /omp/images/thumb/c/cd/Muneco_test.png/180px-Muneco_test.png 1.5x, /omp/images/thumb/c/cd/Muneco_test.png/240px-Muneco_test.png 2x
        // console.log('image imgSrcSet',imgSrcSet);
        //corregir el path en el HTML
        var aImgSrcSet = imgSrcSet.split(', ');
        if (aImgSrcSet.length > 0) {
          //loop all sets
          for (var i = 0; i < aImgSrcSet.length; i++) {
            var set = aImgSrcSet[i];
            var aSet = set.split(' ');
            if (aSet != undefined) {
              var aSet0 = aSet[0];
              //TODO download aset0
              //...
              if (aSet0.startsWith('http://') || aSet0.startsWith('https://')) {
                var fullUrl = aSet0;
              } else {
                var fullUrl = wikiBaseURL + aSet0;
              }
              var aaSet0 = aSet0.split('/');
              var fileName = aaSet0[aaSet0.length - 1];
              var aSet1 = aSet[1];
              var webPath = '/images/mediawiki/' + fileName + ' ' + aSet[1];
              endSet.push(webPath);
              fileName = stringToFileName(decodeURI(fileName)).replace('.html', '').toLowerCase();
              //download
              var imgDestination = '../web_static/www/images/mediawiki/' + fileName;
              // console.log('aImgSrcSet imgDestination: ' + imgDestination);
              // console.log('aImgSrcSet fullUrl: ' + fullUrl);
              // console.log('aImgSrcSet webPath: ' + webPath);
              // console.log('file imgSrcSet downloads.push' ,fullUrl);
              // downloads.push(fullUrl);
              admin.database().ref('/wikiImages/' + fileName.replace('.', '_')).set(fullUrl);

              // download(fullUrl, imgDestination, function(){
              //   // console.log('aImgSrcSet file copied: ' + imgDestination,fullUrl);
              //
              // });
            }
          }
          //get last part of the file name
          imgSrc = aImgSrcSet[aImgSrcSet.length - 1];
          //prepend the final path
          imgSrc = '/images/mediawiki/' + stringToFileName(decodeURI(imgSrc)).replace('.html', '');


        }
        //implode the set for the final string
        imgSrcSet = endSet.join(', ').toLowerCase();

        //guardar cambios
        // console.log('imgSrcSet updated: ',imgSrcSet);
        $(this).attr('srcset', imgSrcSet);

      }
    });
    //parse links looking for images
    $('a').each(function (i, elem) {
      var aImgClass = $(this).attr('class');
      if (aImgClass == 'image') {
        //wiki image is children of A
        var image = $(this).children().first()[0];
        var aImgSrc = image.attribs.src;
        var aImgSrcSet = image.attribs.srcset;
        var baseURL = 'https://www.lorenzobecchi.cloud';
        //     ///omp/images/thumb/7/71/OMP_h%C3%ADgado.jpg/375px-OMP_h%C3%ADgado.jpg 1.5x, /omp/images/thumb/7/71/OMP_h%C3%ADgado.jpg/500px-OMP_h%C3%ADgado.jpg 2x
        // var aSet = aImgSrcSet.split(', ');
        //DEFINE IMAGE SRC
        if (aImgSrc != undefined) {
          // console.log('aImgSrc',aImgSrc);
          //aImgSrc /omp/images/thumb/7/71/OMP_h%C3%ADgado.jpg/250px-OMP_h%C3%ADgado.jpg
          //aImgSrc /omp/images/7/7a/Physical_mini.png
          var aToDownload = aImgSrc.split('/');
          if (aToDownload.length > 2) {
            //get the last occurency to access the file name
            var fileName = aToDownload[aToDownload.length - 1];
            var finalImgName = '/images/mediawiki/' + stringToFileName(decodeURI(fileName)).replace('.html', '');
            //define the new imageset
            // newImgSet.push(finalImgName+ ' ' + setFactor);
            //full url for the download
            var fullUrl = baseURL + aImgSrc;
            // console.log(fullUrl);
            //replace the IMG src in the HTML
            $(this).children().first()[0].attribs.src = finalImgName.toLowerCase();

          }
        }
        //DEFINE IMAGE SRCSET
        var newImgSet = [];
        if (aImgSrcSet != undefined) {
          var aSet = aImgSrcSet.split(', ');
          //DOWNLOAD all images available
          for (var i = 0; i < aSet.length; i++) {
            var imageset = aSet[i];
            var aImgs = imageset.split(' ');
            //define the URL of the remote image
            var wikiURL = baseURL + aImgs[0];
            //get the set factor
            var setFactor = aImgs[1];
            //define array from the wiki path
            var aToDownload = aImgs[0].split('/');
            if (aToDownload.length > 2) {
              //get the last occurency to access the file name
              var finalImgName = '/images/mediawiki/' + stringToFileName(decodeURI(aToDownload[aToDownload.length - 1])).replace('.html', '');
              //define the new imageset
              newImgSet.push(finalImgName + ' ' + setFactor);
              //full url for the download
              var fullUrl = wikiURL;
              // console.log(fullUrl);
              //replace the IMG src in the HTML
              $(this).children().first()[0].attribs.src = finalImgName;
              //download the image
              var imgDestination = '../web_static/www' + finalImgName;
              // console.log('image downloading',fullUrl,aToDownload,imgDestination);
              // download(fullUrl, imgDestination, function(){
              //   console.log('file copied: ' + imgDestination,fullUrl);
              //
              // });
            }
          }
          image.attribs.srcset = newImgSet.join(', ');
          image.attribs.src = newImgSet[0].split(' ')[0];
        }
        image.attribs.alt = '' + decodeURI(image.attribs.alt);
        //OMP h&#xED;gado.jpg
        //OMP h&#xED;gado.jpg
        //     //replace the A link with the Image itself
        $(this).replaceWith(image);
      }
    });
    var content = $.html().replace('<html><head></head><body>', '').replace('</body></html>', '');

    //set content to output
    output.content = content;


    //check category is in ('Public','App');//leave the rest out
    console.log('categories: ', output.categories);
    if (output.categories.length > 0 && (output.categories.includes('Public') || output.categories.includes('App'))) {
      admin.database().ref('/pages/' + output.title).set(output, function (error) {
        if (error) {
          // The write failed...
          console.log(error);
        } else {
          // Data saved successfully!
          console.log('saved on firebase!')




        }
      });
      // console.log('write');
    } else {
      console.log('No write. Page category is not Public or App');
      //delete possible clones on firebase
      admin.database().ref('/pages/' + output.title).set(null);
    }


  }));
  if (flush) {
    // allPagesCallBack();
    console.log('end of the line, good to flush', flush)
    allPagesCallBack()
  }
  // });
}

async function savePageOnFirebase(pageObj) {
  var output = [];
  pageObj = JSON.parse(pageObj);
  var title = pageObj.title;
  var revid = pageObj.revid;
  var text = pageObj.text;
  // output.images = images;
  var links = pageObj.links;
  var externallinks = pageObj.externallinks;
  //reset categories tree
  output.title = title;
  output.revid = revid;
  output.categories = [];

  console.log('---------');
  console.log(title);
  // console.log('---------');
  // // console.log(pageObj);
  // console.log('---------');

  // console.log('-------');
  // console.log(pageObj.categories);

  var categories = pageObj.categories;
  for (var i = 0; i < categories.length; i++) {
    var category = categories[i]['*'];
    // console.log(category)
    if (category != undefined) output.categories.push(category);
  };

  //clean the html
  const $ = cheerio.load(text, {
    decodeEntities: true
  });

  //parse images for download
  $('img').each(function (i, elem) {
    var imgSrc = $(this).attr('src');
    var imgSrcSet = $(this).attr('srcset');
    // donwload from imgSrc
    if (imgSrc != undefined) {
      // image imgSrc /omp/images/thumb/c/cd/Muneco_test.png/120px-Muneco_test.png
      // console.log('image imgSrc',imgSrc);

      //corregir el path en el HTML
      var aImgSrc = imgSrc.split('/');
      if (aImgSrc.length > 0) {
        // console.log('imgSrc',imgSrc);
        // download imgSrc
        if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
          var fullUrl = imgSrc;
        } else {
          var fullUrl = wikiBaseURL + imgSrc;
        }


        //...
        //get last part of the file name
        var fileName = aImgSrc[aImgSrc.length - 1];
        fileName = stringToFileName(decodeURI(fileName)).replace('.html', '').toLowerCase();
        //prepend the final path
        var imgSrc = '/images/mediawiki/' + fileName;
        var imgDestination = '../web_static/www/' + imgSrc;
        // console.log('file imgSrc downloads.push' ,fullUrl);
        // downloads.push(fullUrl);
        admin.database().ref('/wikiImages/' + fileName.replace('.', '_')).set(fullUrl);

        // download(fullUrl, imgDestination, function(){
        //   console.log('file copied: ' + imgDestination,fullUrl);
        //
        // });
      }

      //guardar cambios
      // console.log('imgSrc this: ',$(this));
      $(this).attr('src', imgSrc);
      // console.log('imgSrc updated: ',imgSrc);

    }
    // donwload from imgSrcSet
    if (imgSrcSet != undefined) {
      //define endSet
      var endSet = [];
      // image imgSrcSet /omp/images/thumb/c/cd/Muneco_test.png/180px-Muneco_test.png 1.5x, /omp/images/thumb/c/cd/Muneco_test.png/240px-Muneco_test.png 2x
      // console.log('image imgSrcSet',imgSrcSet);
      //corregir el path en el HTML
      var aImgSrcSet = imgSrcSet.split(', ');
      if (aImgSrcSet.length > 0) {
        //loop all sets
        for (var i = 0; i < aImgSrcSet.length; i++) {
          var set = aImgSrcSet[i];
          var aSet = set.split(' ');
          if (aSet != undefined) {
            var aSet0 = aSet[0];
            //TODO download aset0
            //...
            if (aSet0.startsWith('http://') || aSet0.startsWith('https://')) {
              var fullUrl = aSet0;
            } else {
              var fullUrl = wikiBaseURL + aSet0;
            }
            var aaSet0 = aSet0.split('/');
            var fileName = aaSet0[aaSet0.length - 1];
            var aSet1 = aSet[1];
            var webPath = '/images/mediawiki/' + fileName + ' ' + aSet[1];
            endSet.push(webPath);
            fileName = stringToFileName(decodeURI(fileName)).replace('.html', '').toLowerCase();
            //download
            var imgDestination = '../web_static/www/images/mediawiki/' + fileName;
            // console.log('aImgSrcSet imgDestination: ' + imgDestination);
            // console.log('aImgSrcSet fullUrl: ' + fullUrl);
            // console.log('aImgSrcSet webPath: ' + webPath);
            // console.log('file imgSrcSet downloads.push' ,fullUrl);
            // downloads.push(fullUrl);
            admin.database().ref('/wikiImages/' + fileName.replace('.', '_')).set(fullUrl);

            // download(fullUrl, imgDestination, function(){
            //   // console.log('aImgSrcSet file copied: ' + imgDestination,fullUrl);
            //
            // });
          }
        }
        //get last part of the file name
        imgSrc = aImgSrcSet[aImgSrcSet.length - 1];
        //prepend the final path
        imgSrc = '/images/mediawiki/' + stringToFileName(decodeURI(imgSrc)).replace('.html', '');


      }
      //implode the set for the final string
      imgSrcSet = endSet.join(', ').toLowerCase();

      //guardar cambios
      // console.log('imgSrcSet updated: ',imgSrcSet);
      $(this).attr('srcset', imgSrcSet);

    }
  });
  //parse links looking for images
  $('a').each(function (i, elem) {
    var aImgClass = $(this).attr('class');
    if (aImgClass == 'image') {
      //wiki image is children of A
      var image = $(this).children().first()[0];
      var aImgSrc = image.attribs.src;
      var aImgSrcSet = image.attribs.srcset;
      var baseURL = 'https://www.lorenzobecchi.cloud';
      //     ///omp/images/thumb/7/71/OMP_h%C3%ADgado.jpg/375px-OMP_h%C3%ADgado.jpg 1.5x, /omp/images/thumb/7/71/OMP_h%C3%ADgado.jpg/500px-OMP_h%C3%ADgado.jpg 2x
      // var aSet = aImgSrcSet.split(', ');
      //DEFINE IMAGE SRC
      if (aImgSrc != undefined) {
        // console.log('aImgSrc',aImgSrc);
        //aImgSrc /omp/images/thumb/7/71/OMP_h%C3%ADgado.jpg/250px-OMP_h%C3%ADgado.jpg
        //aImgSrc /omp/images/7/7a/Physical_mini.png
        var aToDownload = aImgSrc.split('/');
        if (aToDownload.length > 2) {
          //get the last occurency to access the file name
          var fileName = aToDownload[aToDownload.length - 1];
          var finalImgName = '/images/mediawiki/' + stringToFileName(decodeURI(fileName)).replace('.html', '');
          //define the new imageset
          // newImgSet.push(finalImgName+ ' ' + setFactor);
          //full url for the download
          var fullUrl = baseURL + aImgSrc;
          // console.log(fullUrl);
          //replace the IMG src in the HTML
          $(this).children().first()[0].attribs.src = finalImgName.toLowerCase();

        }
      }
      //DEFINE IMAGE SRCSET
      var newImgSet = [];
      if (aImgSrcSet != undefined) {
        var aSet = aImgSrcSet.split(', ');
        //DOWNLOAD all images available
        for (var i = 0; i < aSet.length; i++) {
          var imageset = aSet[i];
          var aImgs = imageset.split(' ');
          //define the URL of the remote image
          var wikiURL = baseURL + aImgs[0];
          //get the set factor
          var setFactor = aImgs[1];
          //define array from the wiki path
          var aToDownload = aImgs[0].split('/');
          if (aToDownload.length > 2) {
            //get the last occurency to access the file name
            var finalImgName = '/images/mediawiki/' + stringToFileName(decodeURI(aToDownload[aToDownload.length - 1])).replace('.html', '');
            //define the new imageset
            newImgSet.push(finalImgName + ' ' + setFactor);
            //full url for the download
            var fullUrl = wikiURL;
            // console.log(fullUrl);
            //replace the IMG src in the HTML
            $(this).children().first()[0].attribs.src = finalImgName;
            //download the image
            var imgDestination = '../web_static/www' + finalImgName;
            // console.log('image downloading',fullUrl,aToDownload,imgDestination);
            // download(fullUrl, imgDestination, function(){
            //   console.log('file copied: ' + imgDestination,fullUrl);
            //
            // });
          }
        }
        image.attribs.srcset = newImgSet.join(', ');
        image.attribs.src = newImgSet[0].split(' ')[0];
      }
      image.attribs.alt = '' + decodeURI(image.attribs.alt);
      //OMP h&#xED;gado.jpg
      //OMP h&#xED;gado.jpg
      //     //replace the A link with the Image itself
      $(this).replaceWith(image);
    }
  });
  var content = $.html().replace('<html><head></head><body>', '').replace('</body></html>', '');

  //set content to output
  output.content = content;


  //check category is in ('Public','App');//leave the rest out
  console.log('categories: ', output.categories);
  if (output.categories.length > 0 && (output.categories.includes('Public') || output.categories.includes('App'))) {
    // console.log('output',output)
    return await admin.database().ref('/pages/' + output.title).set(output);
    // return admin.database().ref('/pages/' + output.title).set(output, function (error) {
    //   if (error) {
    //     // The write failed...
    //     console.log(error);
    //   } else {
    //     // Data saved successfully!
    //     console.log('saved on firebase!')

    //     var end = new Date() - start
    //     console.info('Elapsed time: %d s', end / 1000)


    //   }
    // });
    // console.log('write');
  } else {
    console.log('No write. Page category is not Public or App');
    //delete possible clones on firebase
    return await admin.database().ref('/pages/' + output.title).set(null);
  }


  // }));///qui


  // });
}

function stringToFileName(string) {
  if (string == undefined) return string;
  if (string.indexOf('index.php?title=')) {
    string = string.replace('/omp/index.php?title=', "");
    string = string.replace('&action=edit', "");
    string = string.replace('&redlink=1', "");
  }
  string = string.toLowerCase();
  string = string.replace(/ /g, "_");
  // string = string.replace(/[^\x00-\x7F]/g, "");//

  string = string.replace(/\,/g, "");
  string = string.replace(/\;/g, "");
  string = string.replace(/\:/g, "");
  string = string.replace(/\(/g, "");
  string = string.replace(/\)/g, "");
  string = string.replace(/\'/g, "_");
  string = removeDiacritics(string);

  return string + '.html';
}

function removeDiacritics(str) {

  var defaultDiacriticsRemovalMap = [{
      'base': 'A',
      'letters': /[\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F]/g
    },
    {
      'base': 'AA',
      'letters': /[\uA732]/g
    },
    {
      'base': 'AE',
      'letters': /[\u00C6\u01FC\u01E2]/g
    },
    {
      'base': 'AO',
      'letters': /[\uA734]/g
    },
    {
      'base': 'AU',
      'letters': /[\uA736]/g
    },
    {
      'base': 'AV',
      'letters': /[\uA738\uA73A]/g
    },
    {
      'base': 'AY',
      'letters': /[\uA73C]/g
    },
    {
      'base': 'B',
      'letters': /[\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181]/g
    },
    {
      'base': 'C',
      'letters': /[\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E]/g
    },
    {
      'base': 'D',
      'letters': /[\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779]/g
    },
    {
      'base': 'DZ',
      'letters': /[\u01F1\u01C4]/g
    },
    {
      'base': 'Dz',
      'letters': /[\u01F2\u01C5]/g
    },
    {
      'base': 'E',
      'letters': /[\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E]/g
    },
    {
      'base': 'F',
      'letters': /[\u0046\u24BB\uFF26\u1E1E\u0191\uA77B]/g
    },
    {
      'base': 'G',
      'letters': /[\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E]/g
    },
    {
      'base': 'H',
      'letters': /[\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D]/g
    },
    {
      'base': 'I',
      'letters': /[\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197]/g
    },
    {
      'base': 'J',
      'letters': /[\u004A\u24BF\uFF2A\u0134\u0248]/g
    },
    {
      'base': 'K',
      'letters': /[\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2]/g
    },
    {
      'base': 'L',
      'letters': /[\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780]/g
    },
    {
      'base': 'LJ',
      'letters': /[\u01C7]/g
    },
    {
      'base': 'Lj',
      'letters': /[\u01C8]/g
    },
    {
      'base': 'M',
      'letters': /[\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C]/g
    },
    {
      'base': 'N',
      'letters': /[\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4]/g
    },
    {
      'base': 'NJ',
      'letters': /[\u01CA]/g
    },
    {
      'base': 'Nj',
      'letters': /[\u01CB]/g
    },
    {
      'base': 'O',
      'letters': /[\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C]/g
    },
    {
      'base': 'OI',
      'letters': /[\u01A2]/g
    },
    {
      'base': 'OO',
      'letters': /[\uA74E]/g
    },
    {
      'base': 'OU',
      'letters': /[\u0222]/g
    },
    {
      'base': 'P',
      'letters': /[\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754]/g
    },
    {
      'base': 'Q',
      'letters': /[\u0051\u24C6\uFF31\uA756\uA758\u024A]/g
    },
    {
      'base': 'R',
      'letters': /[\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782]/g
    },
    {
      'base': 'S',
      'letters': /[\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784]/g
    },
    {
      'base': 'T',
      'letters': /[\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786]/g
    },
    {
      'base': 'TZ',
      'letters': /[\uA728]/g
    },
    {
      'base': 'U',
      'letters': /[\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244]/g
    },
    {
      'base': 'V',
      'letters': /[\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245]/g
    },
    {
      'base': 'VY',
      'letters': /[\uA760]/g
    },
    {
      'base': 'W',
      'letters': /[\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72]/g
    },
    {
      'base': 'X',
      'letters': /[\u0058\u24CD\uFF38\u1E8A\u1E8C]/g
    },
    {
      'base': 'Y',
      'letters': /[\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE]/g
    },
    {
      'base': 'Z',
      'letters': /[\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762]/g
    },
    {
      'base': 'a',
      'letters': /[\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250]/g
    },
    {
      'base': 'aa',
      'letters': /[\uA733]/g
    },
    {
      'base': 'ae',
      'letters': /[\u00E6\u01FD\u01E3]/g
    },
    {
      'base': 'ao',
      'letters': /[\uA735]/g
    },
    {
      'base': 'au',
      'letters': /[\uA737]/g
    },
    {
      'base': 'av',
      'letters': /[\uA739\uA73B]/g
    },
    {
      'base': 'ay',
      'letters': /[\uA73D]/g
    },
    {
      'base': 'b',
      'letters': /[\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253]/g
    },
    {
      'base': 'c',
      'letters': /[\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184]/g
    },
    {
      'base': 'd',
      'letters': /[\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A]/g
    },
    {
      'base': 'dz',
      'letters': /[\u01F3\u01C6]/g
    },
    {
      'base': 'e',
      'letters': /[\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD]/g
    },
    {
      'base': 'f',
      'letters': /[\u0066\u24D5\uFF46\u1E1F\u0192\uA77C]/g
    },
    {
      'base': 'g',
      'letters': /[\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F]/g
    },
    {
      'base': 'h',
      'letters': /[\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265]/g
    },
    {
      'base': 'hv',
      'letters': /[\u0195]/g
    },
    {
      'base': 'i',
      'letters': /[\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131]/g
    },
    {
      'base': 'j',
      'letters': /[\u006A\u24D9\uFF4A\u0135\u01F0\u0249]/g
    },
    {
      'base': 'k',
      'letters': /[\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3]/g
    },
    {
      'base': 'l',
      'letters': /[\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747]/g
    },
    {
      'base': 'lj',
      'letters': /[\u01C9]/g
    },
    {
      'base': 'm',
      'letters': /[\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F]/g
    },
    {
      'base': 'n',
      'letters': /[\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5]/g
    },
    {
      'base': 'nj',
      'letters': /[\u01CC]/g
    },
    {
      'base': 'o',
      'letters': /[\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275]/g
    },
    {
      'base': 'oi',
      'letters': /[\u01A3]/g
    },
    {
      'base': 'ou',
      'letters': /[\u0223]/g
    },
    {
      'base': 'oo',
      'letters': /[\uA74F]/g
    },
    {
      'base': 'p',
      'letters': /[\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755]/g
    },
    {
      'base': 'q',
      'letters': /[\u0071\u24E0\uFF51\u024B\uA757\uA759]/g
    },
    {
      'base': 'r',
      'letters': /[\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783]/g
    },
    {
      'base': 's',
      'letters': /[\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B]/g
    },
    {
      'base': 't',
      'letters': /[\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787]/g
    },
    {
      'base': 'tz',
      'letters': /[\uA729]/g
    },
    {
      'base': 'u',
      'letters': /[\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289]/g
    },
    {
      'base': 'v',
      'letters': /[\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C]/g
    },
    {
      'base': 'vy',
      'letters': /[\uA761]/g
    },
    {
      'base': 'w',
      'letters': /[\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73]/g
    },
    {
      'base': 'x',
      'letters': /[\u0078\u24E7\uFF58\u1E8B\u1E8D]/g
    },
    {
      'base': 'y',
      'letters': /[\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF]/g
    },
    {
      'base': 'z',
      'letters': /[\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763]/g
    }
  ];

  for (var i = 0; i < defaultDiacriticsRemovalMap.length; i++) {
    str = str.replace(defaultDiacriticsRemovalMap[i].letters, defaultDiacriticsRemovalMap[i].base);
  }

  return str;

}


var download = function (uri, filename, callback) {
  request.head({
    url: uri,
    followAllRedirects: true
  }, function (err, res, body) {
    console.log('download content-err:', err);
    if (res != undefined && res.headers != undefined) {
      console.log('download content-type:', res.headers['content-type']);
      console.log('download content-length:', res.headers['content-length']);
      request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    }

  });
};

function downloadImages(array) {
  console.log('downloadImages', array);

  //create log file
  var file = fs.createWriteStream('wikiImageDownload.log');

  for (var i = 0; i < array.length; i++) {
    //define image final path

    // console.log(array[i]);
    var src = array[i];
    var imgSrc = src.split('/')[src.split('/').length - 1];
    var dest = '../web_static/www/images/mediawiki/' + stringToFileName(decodeURI(imgSrc)).replace('.html', '').toLowerCase();
    //define url to download
    // dest = dest.replace('//','/');
    console.log('downloadImages', src, dest);
    //create console.log();
    //download
    download(src, dest, function () {
      console.log('file copied: ' + src, dest);
      // file.on('error', function(err) { /* error handling */ });
      //append a line to the log file
      file.write(src + '\t' + dest + '\n');


    });
  }
  //close log file
  file.end();
}
