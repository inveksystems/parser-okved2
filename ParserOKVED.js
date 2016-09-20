"use strict";

function log( string ) {
	console.log( "[*] " + string );
}

function converse( paragraphs ) {
	paragraphs.find( "a" ).each( function() {
		let text = $( this ).text();
		$( this ).attr( "href", "/" + text );
	} );
	let html = "";
	paragraphs.each( function() {
		html += "<p>" + $( this ).html() + "</p>";
	} );	
	let result = "markdown:Описание отсутствует";
	if ( html ) {
		result = "markdown:" + $( toMarkdown( html ) ).text();
	}
	return result;
}


log( "Инициализирую библиотеки..." );
let toMarkdown = require( "to-markdown" ),
	cheerio = require( "cheerio" ),
	fs = require( "fs" ),
	mysql = require( "mysql" ),
	progressBar = require( "progress" );

log( "Читаю файл..." );
let contentFile = fs.readFileSync( "okved.html", "utf8" );

log( "Определяю содержимое файла..." );
let $ = cheerio.load( contentFile ),
	tableRows = $( "table tr" );
log( "Найдено " + tableRows.length + " строк." );

log( "Произвожу парсинг..." );
let list = [],
	whatFound = -1,
	countOfElements = {
		section : 0,
		class : 0,
		subClass : 0,
		group : 0,
		subGroup : 0,
		kind : 0
	},
	currentTreeIndex = {
		section : false,
		class : false,
		subClass : false,
		group : false,
		subGroup : false,
		kind : false
	},
	progress = new progressBar( "[*] Обработка строк [:bar] :percent", {
		complete : "x",
		incomplete : "-",
		width : 30,
		total : tableRows.length
	} );
tableRows.each( function( indexRow ) {
	let row = $( this );
	row.find( "td" ).each( function( indexCol ) {
		let contentCol = $( this ).text().trim(),
			element = {
				code : "",
				section : "",
				class : "",
				subClass : "",
				group : "",
				subGroup : "",
				kind : "",
				name : "",
				description : "",
				countOfChildren : 0
			};
		/*
		*	Обработка заголовков.
		*/
		//Раздел
		if ( contentCol.match(/^раздел \S$/i) ) {
			whatFound = 0;
			element.section = contentCol.split(" ").pop();
			element.code = element.section;
			list.push( element );

			currentTreeIndex.section = list.length - 1;
			countOfElements.section++;

			return 0;
		}
		//Класс
		if ( contentCol.match(/^\d\d$/) ) {
			whatFound = 1;
			let neighbour = list[ list.length - 1 ];
			element.section = neighbour.section;
			element.class = contentCol;
			element.code = contentCol;
			list.push( element );

			list[ currentTreeIndex.section ].countOfChildren++;
			currentTreeIndex.class = list.length - 1;
			countOfElements.class++;

			return 0;
		}
		//Подкласс
		if ( contentCol.match(/^\d\d\.\d$/) ) {
			whatFound = 2;
			let neighbour = list[ list.length - 1 ];
			element.section = neighbour.section;
			element.class = neighbour.class;
			element.subClass = contentCol.split(".").pop();
			element.code = contentCol;
			list.push( element );

			list[ currentTreeIndex.class ].countOfChildren++;
			currentTreeIndex.subClass = list.length - 1;
			countOfElements.subClass++;

			return 0;
		}
		//Группа
		if ( contentCol.match(/^\d\d\.\d\d$/) ) {
			whatFound = 3;
			let neighbour = list[ list.length - 1 ];
			element.section = neighbour.section;
			element.class = neighbour.class;
			element.subClass = neighbour.subClass;
			element.group = neighbour.subClass + contentCol.split(".").pop() % 10;
			element.code = contentCol;
			list.push( element );

			list[ currentTreeIndex.subClass ].countOfChildren++;
			currentTreeIndex.group = list.length - 1;
			countOfElements.group++;

			return 0;
		}
		//Подгруппа
		if ( contentCol.match(/^\d\d\.\d\d\.\d$/) ) {
			whatFound = 4;
			let neighbour = list[ list.length - 1 ];
			element.section = neighbour.section;
			element.class = neighbour.class;
			element.subClass = neighbour.subClass;
			element.group = neighbour.group;
			element.subGroup = contentCol.split(".").pop();
			element.code = contentCol;
			list.push( element );

			list[ currentTreeIndex.group ].countOfChildren++;
			currentTreeIndex.subGroup = list.length - 1;
			countOfElements.subGroup++;

			return 0;
		}
		//Вид
		if ( contentCol.match(/^\d\d\.\d\d\.\d\d$/) ) {
			whatFound = 5;
			let neighbour = list[ list.length - 1 ];
			element.section = neighbour.section;
			element.class = neighbour.class;
			element.subClass = neighbour.subClass;
			element.group = neighbour.group;
			element.subGroup = neighbour.subGroup;
			element.kind = element.subGroup + contentCol.split(".").pop() % 10;
			element.code = contentCol;
			list.push( element );

			list[ currentTreeIndex.subGroup ].countOfChildren++;
			currentTreeIndex.kind = list.length - 1;
			countOfElements.kind++;

			return 0;
		}
		/*
		*	Обработка названия и описания.
		*/
		if ( contentCol ) {
			switch ( whatFound ) {
				case 0: 
				case 1:
					element = list[ list.length - 1 ];
					if ( !element.name ) {
						element.name = contentCol;
					} else {
						element.description = contentCol;
					}
					break;
				case 2:
				case 3:
				case 4:
				case 5:
					element = list[ list.length - 1 ];
					let firstParagraph = $( this ).find( "p" ).eq( 0 ),
						name = firstParagraph.text(),
						description = converse( $( this ).find( "p" ).not( firstParagraph ) );
					element.name = name;
					element.description = description;
					break;
			}
		}
	} );
	progress.tick();
} );

log( "Записываю в базу данных." );
progress = new progressBar( "[*] Записано [:bar] :percent", {
	complete : "x",
	incomplete : "-",
	width : 30,
	total : list.length
} );
let dbConnect = mysql.createConnection({
	host : "127.0.0.1",
	user : "root",
	password : "year",
	database : "test"
});
let countOfInsertedData = 0;
for ( let i = 0; i < list.length; i++ ) {
	let query = "INSERT INTO okved2 (`child_node_count`, `code`, `section_okved`, `class_okved`, `subclass_okved`, `group_okved`, `subgroup_okved`, `kind_okved`, `name`, `description`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
	dbConnect.query( query, [
		list[i].countOfChildren,
		list[i].code,
		list[i].section,
		list[i].class,
		list[i].subClass,
		list[i].group,
		list[i].subGroup,
		list[i].kind,
		list[i].name,
		list[i].description
	], ( err, res ) => {
		if ( err ) throw err;
		progress.tick();
		countOfInsertedData++;
		if ( countOfInsertedData === list.length ) {
			log( "Программа окончила работу." );
			process.exit();
		}
	} );
}
