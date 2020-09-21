"use strict";
var Legal = /** @class */ (function () {
    /**
     * Creates a new instance of Legal
     * @param options Options to be passed
     */
    function Legal(options) {
        this.options = shallowClone(options);
        // Setup the theme and set the border color to transparent when needed. 
        // Because we modify theme here, we need to clone it. 
        this.theme = shallowClone(this.options.dark ? DARK_THEME : LIGHT_THEME);
        if (!this.options.float) {
            this.theme.border = 'transparent';
        }
        // When we have an element set, turn off the fixed and no border options
        if (this.options.element) {
            this.options.float = true;
            this.theme.border = 'transparent';
        }
        // If the user can not opt-out disable statistics to be safe. 
        // That way you can't say the user could not opt out. 
        if (!window.localStorage && this.options.siteID) {
            debug_warn('Local Storage is not supported by this Browser. ');
            debug_warn('Assuming that the user has opted out statistics to be safe. ');
            delete this.options.siteID;
        }
        this.parent = document.createElement('div');
        this.element = document.createElement(this.options.element ? 'span' : 'small');
        this.link = document.createElement('a');
        this.optOutElement = document.createElement('span');
        this.setupElementTree();
    }
    /**
     * Initializes the Legal Script
     * @param globalObject Global Object to register instance under
     */
    Legal.initScript = function (globalObject) {
        var script = document.currentScript;
        if (script === null) {
            debug_fatal('Something went wrong loading the legal script. ');
            debug_fatal('This probably means document.currentScript isn\'t supported by this browser. ');
            debug_fatal('Bailing out. ');
            return;
        }
        globalObject.legal = Legal.fromScriptTag(script);
        globalObject.legal.run();
    };
    /**
     * Generates a new instance of Legal from a script tag.
     * @param element <script> element to create instance from
     */
    Legal.fromScriptTag = function (element) {
        // Read the src url from the script tag and split it into options. 
        var src = element.getAttribute('src');
        if (typeof src !== 'string') {
            debug_fatal("Missing 'src' attribute of script. ");
            return null;
        }
        var srcOptions = new URL(src, location.href).search.substr(1).split(',');
        // Parse the extracted options into a proper Options Dict. 
        // We only parse non-empty options that are URL settable. 
        // In case of an empty option, we ignore the option. 
        // In case of an unknown option, we log it to the console. 
        var options = {};
        forEach(srcOptions, function (option) {
            if (option === '')
                return; // this is needed when no '?' is included in the url
            if (!isURLSettableOption(option)) {
                debug_warn("Option '" + option + "' is not known. ");
                return;
            }
            options[option] = true;
        });
        // When the element was loaded without an 'async' attr we should insert it right after this element. 
        if (!element.hasAttribute('async')) {
            options.element = element;
        }
        // When a site id was set (via a data attribute) we set the site id attribute here. 
        var statsSiteId = element.getAttribute(Legal.STATS_ID_ATTR);
        if (statsSiteId) {
            options.siteID = statsSiteId;
        }
        // Create the new Legal object from the provided options.
        return new Legal(options);
    };
    /** Sets up the structure of elements on the page */
    Legal.prototype.setupElementTree = function () {
        // Setup the <a> element
        this.link.setAttribute('href', Legal.URL_POLICY);
        this.link.setAttribute('target', '_blank');
        this.link.appendChild(document.createTextNode(this.options.cookies ? Legal.URL_TITLE_COOKIES : Legal.URL_TITLE));
        // Setup the element itself
        this.element.appendChild(document.createTextNode((this.options.cookies ? Legal.TEXT_PREFIX_COOKIES : '') +
            Legal.TEXT_PREFIX));
        this.element.appendChild(this.link);
        this.element.appendChild(document.createTextNode(Legal.TEXT_SUFFIX));
        this.element.appendChild(this.optOutElement);
        // finally append it to the parent
        this.parent.appendChild(this.element);
    };
    //
    // MAIN RUN CODE
    //
    Legal.prototype.run = function () {
        var _this = this;
        // if we have a site-id turn on the tracking script. 
        if (this.options.siteID) {
            this.setStats(!this.getOptout());
        }
        // add the CSS
        this.applyStyle(this.parent);
        onDOMReady(function () {
            if (_this.options.element) {
                insertAfter(_this.element, _this.options.element);
            }
            else {
                document.body.appendChild(_this.parent);
            }
        });
    };
    /**
     * Applies the caller-selected style to the elements
     * @param parent Parent Element that is inserted into the DOM
     */
    Legal.prototype.applyStyle = function (parent) {
        if (this.options.element)
            return; // if we are in element mode, don't apply any styles
        this.element.style.color = this.theme.color;
        this.link.style.color = this.theme.link;
        this.element.style.borderColor = this.theme.border;
        if (!this.options.float) {
            this.element.style.background = this.theme.background;
        }
        // setup the positioing
        this.element.style.display = 'block';
        if (!this.options.float) {
            this.parent.style.position = 'fixed';
            // align to the right
            this.parent.style.right = Legal.LARGE_SPACE;
            this.element.style.position = 'relative';
            this.element.style.right = Legal.LARGE_SPACE;
            // margin and padding
            this.element.style.border = Legal.BORDER_SIZE + " solid " + this.theme.border;
            this.element.style.padding = Legal.SMALL_SPACE;
            this.element.style.borderRadius = Legal.LARGE_SPACE;
            this.parent.style.bottom = '0px';
        }
        else {
            // align to the right
            this.element.style.textAlign = 'right';
            // hide overflow on the parent
            this.parent.style.margin = '0';
            this.parent.style.padding = '0';
            this.parent.style.overflow = 'none';
            this.parent.style.width = '100%';
            // no margin, and proper padding
            this.element.style.margin = '0';
            this.element.style.paddingTop = Legal.SMALL_SPACE;
            this.element.style.paddingBottom = Legal.SMALL_SPACE;
            this.element.style.paddingRight = Legal.LARGE_SPACE;
            // border in the right place
            this.element.style.borderTop = Legal.BORDER_SIZE + " solid " + this.theme.border;
        }
    };
    //
    // STATS
    //
    Legal.prototype.setStats = function (value) {
        this.setOptout(!value);
        this.generateStatsLink(!value);
        if (value) {
            this.loadStatsScript();
        }
        else {
            this.unloadStatsScript();
        }
    };
    Legal.prototype.loadStatsScript = function () {
        if (this.statsScript)
            return;
        var scriptElement = document.createElement('script');
        scriptElement.setAttribute('data-ackee-server', Legal.ACKEE_SERVER);
        scriptElement.setAttribute('data-ackee-domain-id', this.options.siteID);
        scriptElement.setAttribute('async', '');
        scriptElement.setAttribute('src', Legal.ACKEE_SCRIPT);
        document.head.appendChild(scriptElement);
        this.statsScript = scriptElement;
    };
    /**
     * Attempt to unload the statistics script
     */
    Legal.prototype.unloadStatsScript = function () {
        // If we didn't load the script, there is nothing to do. 
        if (this.statsScript === undefined)
            return;
        // With the current method of inclusion it is not actually possible to unload the script. 
        // However there might be any kind of state on the current page, so we inform the user first. 
        if (!confirm(Legal.TEXT_OPTOUT_RELOAD_NOW))
            return;
        location.reload();
    };
    Legal.prototype.generateStatsLink = function (toSetTo) {
        var _this = this;
        this.optOutElement.innerHTML = "";
        // create a link to (undo) opt-out
        var link = document.createElement('a');
        link.setAttribute('href', "javascript:void");
        if (!this.options.element) {
            link.style.color = this.theme.link;
        }
        link.appendChild(document.createTextNode(toSetTo ? Legal.TEXT_STATS_OFF : Legal.TEXT_STATS_ON));
        link.addEventListener('click', function (e) {
            e.preventDefault();
            _this.setStats(toSetTo);
            return false;
        });
        // append the text to the 'extraNode'
        this.optOutElement.innerHTML = "";
        this.optOutElement.appendChild(link);
        this.optOutElement.appendChild(document.createTextNode(Legal.TEXT_STATS_SUFFIX));
    };
    Legal.prototype.getOptout = function () {
        return window.localStorage.getItem(Legal.STATS_OPT_OUT_KEY) === Legal.STATS_OPT_OUT_VALUE;
    };
    Legal.prototype.setOptout = function (value) {
        if (value) {
            window.localStorage.setItem(Legal.STATS_OPT_OUT_KEY, Legal.STATS_OPT_OUT_VALUE);
        }
        else {
            window.localStorage.removeItem(Legal.STATS_OPT_OUT_KEY);
        }
    };
    Legal.STATS_ID_ATTR = 'data-site-id'; // data attribute that the site id should be read from
    //
    // ELEMENT STRUCTURE
    //
    Legal.URL_POLICY = 'https://inform.everyone.wtf';
    Legal.URL_TITLE = 'my Privacy Policy and Imprint';
    Legal.URL_TITLE_COOKIES = 'my Privacy Policy, Imprint and Cookie Policy';
    Legal.TEXT_PREFIX_COOKIES = 'This site makes use of cookies for essential features. ';
    Legal.TEXT_PREFIX = 'For legal reasons I must link ';
    Legal.TEXT_SUFFIX = '. ';
    Legal.BORDER_SIZE = '1px';
    Legal.SMALL_SPACE = '5px';
    Legal.LARGE_SPACE = '10px';
    Legal.TEXT_OPTOUT_RELOAD_NOW = "Your opt-out has been saved. To complete the opt-out, please reload the page. \n\nClick 'OK' to reload the page now. \nClick 'Cancel' to keep browsing and apply the preference when next reloading the page. ";
    Legal.ACKEE_SERVER = 'https://track.everyone.wtf'; // server for ackee
    Legal.ACKEE_SCRIPT = Legal.ACKEE_SERVER + '/tracker.js'; // tracker
    Legal.TEXT_STATS_ON = 'Opt-Out of Stats';
    Legal.TEXT_STATS_OFF = 'Undo Opt-Out of Stats';
    Legal.TEXT_STATS_SUFFIX = '. ';
    //
    // OPT-OUT STORAGE
    //
    Legal.STATS_OPT_OUT_KEY = 'wtf.track.everyone.old.photos';
    Legal.STATS_OPT_OUT_VALUE = WhenYouAccidentallyComment();
    return Legal;
}());
var urlOptions = ['cookies', 'dark', 'float'];
/**
 * Checks if a string is of type URLSettableOption
 */
function isURLSettableOption(option) {
    for (var _i = 0, urlOptions_1 = urlOptions; _i < urlOptions_1.length; _i++) {
        var value = urlOptions_1[_i];
        if (value === option)
            return true;
    }
    return false;
}
var LIGHT_THEME = {
    color: 'black',
    background: 'white',
    border: 'black',
    link: 'blue'
};
var DARK_THEME = {
    color: 'white',
    background: 'black',
    border: 'white',
    link: 'blue'
};
//
// UTILITY FUNCTIONS
//
/**
 * Prints a warning to the warning log
 * @param data Data to print to the debug log
 */
function debug_warn() {
    var data = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        data[_i] = arguments[_i];
    }
    if (!(console && console.warn))
        return;
    console.warn.apply(console, data);
}
/**
 * Prints a fatal error to the error log
 * @param data Data tro print to the error log
 */
function debug_fatal() {
    var data = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        data[_i] = arguments[_i];
    }
    if (!(console && console.error))
        return;
    console.error.apply(console, data);
}
/**
 * Foreach runs a fyunction for each element of an array
 */
function forEach(ary, f) {
    if (typeof ary.forEach === 'function')
        return ary.forEach(f);
    for (var i = 0; i < ary.length; i++) {
        f(ary[i]);
    }
}
/**
 * Makes a shallow clone of an object, that is it copies each own property of original into a new object clone.
 * @param original Object to clone.
 */
function shallowClone(original) {
    var clone = {};
    for (var key in original) {
        if (!original.hasOwnProperty(key))
            continue;
        clone[key] = original[key];
    }
    return clone;
}
/**
 * OnDOMReady runs code when the DOM becomes available on the current document.
 * If the DOM is already available, runs code immediatly.
 * @param code Code to run
 */
function onDOMReady(code) {
    var state = document.readyState;
    if (state === "complete" || state === "interactive") {
        return code();
    }
    window.addEventListener('DOMContentLoaded', code);
}
/**
 * Insert an element right after a provided element
 * @param element New element to insert
 * @param after Element to insert after
 */
function insertAfter(element, after) {
    var parentNode = after.parentElement;
    if (parentNode === null) {
        throw new Error("after.parentElement is null");
    }
    var sibling = after.nextSibling;
    if (sibling !== null) {
        parentNode.insertBefore(element, sibling);
    }
    else {
        parentNode.appendChild(element);
    }
}
//
// Initialization Code
//
Legal.initScript(window);
//
// Text Resources
//
function WhenYouAccidentallyComment() {
    return "When in the Course of human events, it becomes necessary for\none people to dissolve the political bands which have connected\nthem with another, and to assume, among the Powers of the earth,\nthe separate and equal station to which the Laws of Nature and\nof Nature's God entitle them, a decent respect to the opinions\nof mankind requires that they should declare the causes which\nimpel them to the separation.\n\nWe hold these truths to be self-evident, that all men are created equal,\nthat they are endowed by their Creator with certain unalienable Rights,\nthat among these are Life, Liberty, and the pursuit of Happiness.\nThat to secure these rights, Governments are instituted among Men,\nderiving their just powers from the consent of the governed,\nThat whenever any Form of Government becomes destructive of these ends,\nit is the Right of the People to alter or to abolish it, and to institute\nnew Government, laying its foundation on such principles and organizing\nits powers in such form, as to them shall seem most likely to effect\ntheir Safety and Happiness.  Prudence, indeed, will dictate that Governments\nlong established should not be changed for light and transient causes;\nand accordingly all experience hath shown, that mankind are more disposed\nto suffer, while evils are sufferable, than to right themselves by abolishing\nthe forms to which they are accustomed.  But when a long train of abuses and\nusurpations, pursuing invariably the same Object evinces a design to reduce\nthem under absolute Despotism, it is their right, it is their duty, to throw\noff such Government, and to provide new Guards for their future security.\n--Such has been the patient sufferance of these Colonies; and such is now\nthe necessity which constrains them to alter their former Systems of Government.\nThe history of the present King of Great Britain is a history of repeated\ninjuries and usurpations, all having in direct object the establishment\nof an absolute Tyranny over these States.  To prove this, let Facts\nbe submitted to a candid world.\n\nHe has refused his Assent to Laws, the most wholesome and necessary\nfor the public good.\n\nHe has forbidden his Governors to pass Laws of immediate\nand pressing importance, unless suspended in their operation\ntill his Assent should be obtained; and when so suspended,\nhe has utterly neglected to attend to them.\n\nHe has refused to pass other Laws for the accommodation of\nlarge districts of people, unless those people would relinquish\nthe right of Representation in the Legislature, a right\ninestimable to them and formidable to tyrants only.\n\nHe has called together legislative bodies at places unusual,\nuncomfortable, and distant from the depository of their\nPublic Records, for the sole purpose of fatiguing them\ninto compliance with his measures.\n\nHe has dissolved Representative Houses repeatedly, for opposing\nwith manly firmness his invasions on the rights of the people.\n\nHe has refused for a long time, after such dissolutions,\nto cause others to be elected; whereby the Legislative Powers,\nincapable of Annihilation, have returned to the People at large\nfor their exercise; the State remaining in the mean time exposed\nto all the dangers of invasion from without, and convulsions within.\n\nHe has endeavoured to prevent the population of these States;\nfor that purpose obstructing the Laws of Naturalization of Foreigners;\nrefusing to pass others to encourage their migration hither,\nand raising the conditions of new Appropriations of Lands.\n\nHe has obstructed the Administration of Justice, by refusing his Assent\nto Laws for establishing Judiciary Powers.\n\nHe has made judges dependent on his Will alone, for the tenure\nof their offices, and the amount and payment of their salaries.\n\nHe has erected a multitude of New Offices, and sent hither swarms of\nOfficers to harass our People, and eat out their substance.\n\nHe has kept among us, in times of peace, Standing Armies\nwithout the Consent of our legislatures.\n\nHe has affected to render the Military independent of\nand superior to the Civil Power.\n\nHe has combined with others to subject us to a jurisdiction\nforeign to our constitution, and unacknowledged by our laws;\ngiving his Assent to their Acts of pretended legislation:\n\nFor quartering large bodies of armed troops among us:\n\nFor protecting them, by a mock Trial, from Punishment for any Murders\nwhich they should commit on the Inhabitants of these States:\n\nFor cutting off our Trade with all parts of the world:\n\nFor imposing taxes on us without our Consent:\n\nFor depriving us, in many cases, of the benefits of Trial by Jury:\n\nFor transporting us beyond Seas to be tried for pretended offences:\n\nFor abolishing the free System of English Laws in a neighbouring\nProvince, establishing therein an Arbitrary government,\nand enlarging its Boundaries so as to render it at once\nan example and fit instrument for introducing the same\nabsolute rule into these Colonies:\n\nFor taking away our Charters, abolishing our most valuable Laws,\nand altering fundamentally the Forms of our Governments:\n\nFor suspending our own Legislatures, and declaring themselves\ninvested with Power to legislate for us in all cases whatsoever.\n\nHe has abdicated Government here, by declaring us out of his Protection\nand waging War against us.\n\nHe has plundered our seas, ravaged our Coasts, burnt our towns,\nand destroyed the lives of our people.\n\nHe is at this time transporting large armies of foreign mercenaries\nto compleat the works of death, desolation and tyranny, already begun\nwith circumstances of Cruelty & perfidy scarcely paralleled in the\nmost barbarous ages, and totally unworthy of the Head of a civilized nation.\n\nHe has constrained our fellow Citizens taken Captive on the high Seas\nto bear Arms against their Country, to become the executioners of\ntheir friends and Brethren, or to fall themselves by their Hands.\n\nHe has excited domestic insurrections amongst us, and has\nendeavoured to bring on the inhabitants of our frontiers,\nthe merciless Indian Savages, whose known rule of warfare,\nis an undistinguished destruction of all ages, sexes and conditions.\n\nIn every stage of these Oppressions We have Petitioned for Redress\nin the most humble terms:  Our repeated Petitions have been answered\nonly by repeated injury.  A Prince, whose character is thus marked\nby every act which may define a Tyrant, is unfit to be the ruler\nof a free People.\n\nNor have We been wanting in attention to our Brittish brethren.\nWe have warned them from time to time of attempts by their\nlegislature to extend an unwarrantable jurisdiction over us.\nWe have reminded them of the circumstances of our emigration and\nsettlement here.  We have appealed to their native justice\nand magnanimity, and we have conjured them by the ties of our\ncommon kindred to disavow these usurpations, which would inevitably\ninterrupt our connections and correspondence.  They too have been\ndeaf to the voice of justice and of consanguinity.  We must, therefore,\nacquiesce in the necessity, which denounces our Separation, and hold them,\nas we hold the rest of mankind, Enemies in War, in Peace Friends.\n\nWe, therefore, the Representatives of the United States of America,\nin General Congress, Assembled, appealing to the Supreme Judge of\nthe world for the rectitude of our intentions, do, in the Name,\nand by the Authority of the good People of these Colonies,\nsolemnly publish and declare, That these United Colonies are,\nand of Right ought to be Free and Independent States;\nthat they are Absolved from all Allegiance to the British Crown,\nand that all political connection between them and the State\nof Great Britain, is and ought to be totally dissolved;\nand that as Free and Independent States, they have full Power to\nlevy War, conclude Peace, contract Alliances, establish Commerce,\nand to do all other Acts and Things which Independent States may\nof right do.  And for the support of this Declaration, with a firm\nreliance on the Protection of Divine Providence, we mutually pledge\nto each other our Lives, our Fortunes and our sacred Honor.";
}
