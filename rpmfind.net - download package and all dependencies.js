/* eslint-disable dot-notation */
/* eslint-disable userscripts/better-use-match */
/* eslint-disable no-loop-func */
// ==UserScript==
// @name         rpmfind - download package and all dependencies
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Recursively download a package with all of its dependencies, including the most basic/primite ones for sandboxing or whatever other purposes.
// @author       Miro
// @include      /^http.*:\/\/(?:www\.)?rpmfind\.net\/linux\/RPM\/.+$/
// @icon         https://www.google.com/s2/favicons?domain=rpmfind.net
// @grant        GM_download
// ==/UserScript==

(function() {
    'use strict';

    // Static
    let CUR_MSG_TIMEOUT_ID;
    let TEMP_MSG_DF_DURATION = 2000;

    // Dynamic
    let DISTRIBUTION_USER_INPUT = "";
    let DOWNLOADED_LINKS_ARR = [];
    let VISITED_PAGES_ARR = [];
    let VISITED_SEARCH_PAGES_ARR = [];
    let ERRORS = [];

    //////////////////////////////////////////////////////

    init();
    function init()
    {
        // add html
        let styleHtml =
            `<style id="generalStyle">
                #sideBtns {position: fixed; top: 50%; transform: translatey(-50%); right:0; display: block; font-size: 1.2rem; padding: 10px 10px 10px 15px; border-radius: 20px 0px 0px 20px; background: black; z-index: 99999999;}
                #sideBtns button {cursor: pointer; background: #741c1c; color: white; padding: 3px; border-radius: 5px;}
                #sideBtns p:first-child button {margin-bottom: 10px;}
            </style>`;
        document.querySelector(`html`).appendChild(html_to_node(styleHtml));

        let btnHtml =
            `<div id="sideBtns">
                <button id="downloadAllDeps">DL ALL DEPS</button>
            </div>`;
        document.querySelector("html").appendChild(html_to_node(btnHtml));

        // add events
        document.querySelector("#downloadAllDeps").addEventListener("click", run);
    }

    //////////////////////////////////////////////////////

    async function run()
    {
        document.querySelector("#downloadAllDeps").disabled = true;

        // Reset variables
        DISTRIBUTION_USER_INPUT = "";
        DOWNLOADED_LINKS_ARR = [];
        VISITED_PAGES_ARR = [];
        VISITED_SEARCH_PAGES_ARR = [];
        ERRORS = [];

        // User Confirmation
        let usrConfirmsStart = confirm("Are you on the page containing the main package you're trying to download?\nThis script will download this package and ALL dependencies recursively!");
        if (!usrConfirmsStart) {
            display_msg({text:"Operation cancelled.", type:"e"});
            document.querySelector("#downloadAllDeps").disabled = false;
            return;
        }

        // User input - Distribution
        let usrResp = prompt("ENTER DISTRIBUTION TEXT\nExact copy of the 'Distribution' column in search results \nExample: 'Fedora 38 for x86_64')");
        try {usrResp = usrResp.trim()} catch(err) {}
        if (!usrResp || !/^.+ for .+$/.test(usrResp)) {
            display_msg({text:"Invalid response. Operation cancelled.", type:"e"});
            document.querySelector("#downloadAllDeps").disabled = false;
            return;
        }

        DISTRIBUTION_USER_INPUT = usrResp.toLowerCase();

        // Generate links
        await generate_download_links(window.location.href);

        // Display link fetching errors
        if (ERRORS.length > 0) {
            alert(`LIKELY NON-COMPLETE LIST OF LINKS GENERATED DUE TO THE FOLLOWING ERRORS:\n\n${ERRORS.join("\n\n")}`);
            let usrConfirmsDonwloadWithErrors = confirm("Would you like to proceed with the download anyway?");
            if (!usrConfirmsDonwloadWithErrors) {
                display_msg({text:"Download cancelled", type:"e"});
                document.querySelector("#downloadAllDeps").disabled = false;
                return;
            }
        }
        else {
            display_msg({text:"Preparing to download", type:"s", duration:"perm"});
        }

        ERRORS = [];
        DOWNLOADED_LINKS_ARR = [...new Set(DOWNLOADED_LINKS_ARR)]; // remove dupes

        // Download
        let downloadCounter = 0;
        for (let downloadLink of DOWNLOADED_LINKS_ARR) {
            downloadCounter += 1;
            await GM.download({
                url: downloadLink,
                saveAs: false,
                name: downloadLink.replace(/\/$/, '').split('/').pop(),
                onerror: () => {
                    ERRORS.push(`FAILED TO DOWNLOAD:\n${downloadLink}`);
                },
                onload: () => {
                    display_msg({text:`Donwloaded ${downloadCounter}/${DOWNLOADED_LINKS_ARR.length}`, type:"n", duration:"perm"});
                }
            });
        }

        if (ERRORS.length > 0) {
            alert(`DOWNLOADS FINISHED WITH ERRORS:\n\n${ERRORS.join("\n\n")}`);
        }
        else {
            display_msg({text:"Operation complete", type:"s"});
        }

        document.querySelector("#downloadAllDeps").disabled = false;
    }

    //////////////////////////////////////////////////////

    async function generate_download_links(packagePageLink)
    {
        display_msg({text:`Getting download link for ${packagePageLink.replace(/\/$/, '').split('/').pop().split(".html")[0]}`, type:"n", duration:"perm"});
        VISITED_PAGES_ARR.push(packagePageLink);

        // Get the page
        let packagePageDom = await fetch_html_data(packagePageLink, "td");
        if (!packagePageDom) {
            ERRORS.push(`Failed to fetch package page:\n${packagePageLink}`);
            return;
        }

        // Add package to download links
        let downloadLink = get_download_link_from_package_page(packagePageDom);
        if (downloadLink) {
            DOWNLOADED_LINKS_ARR.push(downloadLink);
        }
        else {
            ERRORS.push(`Failed to obtain download link for:\n${packagePageLink}`);
        }

        // Get the links for all dependencies of the current package
        let depSearchLinksArr = get_dependencies_search_links_arr(packagePageDom);

        // For each dependency, get its results page, and for each link in the results page that matches DISTRIBUTION_USER_INPUT, run this function again
        for (let depSearchLink of depSearchLinksArr) {
            if (VISITED_SEARCH_PAGES_ARR.includes(depSearchLink)) {
                continue;
            }
            else {
                VISITED_SEARCH_PAGES_ARR.push(depSearchLink);
            }

            let resultsPageDom = await fetch_html_data(depSearchLink, "tr");
            if (!resultsPageDom) {
                ERRORS.push(`Failed to fetch search results page:\n${depSearchLink}`);
                continue;
            }

            let newPackagesPageLinksArr = get_search_results_matched_pages_links_arr(resultsPageDom);
            for (let newPackagePageLink of newPackagesPageLinksArr) {
                await generate_download_links(newPackagePageLink);
            }
        }
    }

    //////////////////////////////////////////////////////

    function get_download_link_from_package_page(packagePageDom)
    {
        let downloadLink;
        for (let tdElem of packagePageDom.querySelectorAll("td")) {
            if (tdElem.innerText.trim().startsWith("Source RPM:")) {
                downloadLink = tdElem.querySelector("a").href;
                break;
            }
        }
        return downloadLink;
    }

    function get_dependencies_search_links_arr(packagePageDom)
    {
        let requiresTitleElem;
        for (let titleElem of packagePageDom.querySelectorAll("h3")) {
            if (titleElem.innerText.trim().toLowerCase() == "requires") {
                requiresTitleElem = titleElem;
                break;
            }
        }
        if (!requiresTitleElem || requiresTitleElem.nextElementSibling.nodeName != "UL") {
            return [];
        }

        let dependenciesListElem = requiresTitleElem.nextElementSibling;
        let outputArr = [];
        for (let linkElem of dependenciesListElem.querySelectorAll("li a")) {
            outputArr.push(linkElem.href);
        }

        return outputArr;
    }

    function get_search_results_matched_pages_links_arr(resultsPageDom)
    {
        let resultsArr = [];

        for (let tableRowElem of resultsPageDom.querySelectorAll("tr")) {
            if (tableRowElem.innerText.toLowerCase().includes(DISTRIBUTION_USER_INPUT)) {
                let pageLink = tableRowElem.querySelector("td:first-child a").href;
                if (!VISITED_PAGES_ARR.includes(pageLink)) {
                    if (DISTRIBUTION_USER_INPUT.includes("x86_64") && pageLink.includes("i686")) {
                        continue; // with x86_64, there may sometimes be two results, one for 32 bit (i686) and one for the 64 bit (typically, first the i686). Since 32 bit is uncommon, we skip it
                    }
                    else {
                        resultsArr.push(pageLink);
                        break; // the first result is always what you're looking even if there are multiple (example: [linux-release], linux-release-kde)
                    }
                }
            }
        }

        return resultsArr;
    }

    //////////////////////////////////////////////////////

    function html_to_node(code)
    {
        let tempWrapper = document.createElement("div");
        tempWrapper.innerHTML = code;
        if (tempWrapper.childElementCount == 1) tempWrapper = tempWrapper.firstChild;
        return tempWrapper;
    }

    async function fetch_html_data(url, selectorToTest)
    {
        let attempts = 0;
        while (attempts < 5) {
            try {
                let response = await fetch(url, {method: 'get', credentials: 'include'});
                let htmlString = await response.text();
                let parser = new DOMParser();
                let pageDom = parser.parseFromString(htmlString, "text/html");
                if (selectorToTest) pageDom.querySelector(selectorToTest).getAttribute("test");
                return pageDom;
            }
            catch(err) {
                await delay(100);
            }

            attempts += 1;
        }
        return false;
    }


    function delay(durationMs)
    {
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    // attrsObj = {text: "blah", type: "neutral|n|success|s|error|e", duration: num|"perm"|"temp(df-duration)"}
        // text is a string of text
        // type is a string, either "neutral" "n" "success" "s" "error" "e" (single letter is the short version)
            // if not provided, it default to "neutral"
        // duration is either a string "perm", "temp" "df", or a number - duration in milliseconds
            // both "temp" and "df" default to TEMP_MSG_DF_DURATION milliseconds
            // if duration is not provided then once again, defaults to TEMP_MSG_DF_DURATION milliseconds
    function display_msg(attrsObj)
    {
        let text, type, duration;

        if (!attrsObj["text"]) {
            return;
        } else {
            text = attrsObj["text"];
        }

        if (!attrsObj["type"] || !["neutral", "n", "success", "s", "error", "e"].includes(attrsObj["type"])) {
            type = "n"; // default type
        } else {
            type = attrsObj["type"].charAt(0);
        }

        if (!attrsObj["duration"] || ["temp", "df"].includes(attrsObj["duration"])) {
            duration = TEMP_MSG_DF_DURATION; // default duraction
        } else if (attrsObj["duration"] == "perm") {
            duration = attrsObj["duration"];
        } else {
            duration = parseInt(attrsObj["duration"]);
            if (isNaN(duration)) duration = TEMP_MSG_DF_DURATION;
        }

        rm_msg();

        let bColor;
        if (type == "s") bColor = "#076007";
        else if (type == "n") bColor = "#40400e";
        else if (type == "e") bColor = "#c00";

        document.querySelector(`html`).appendChild(html_to_node(`<p id="custMsg" style="position:fixed; bottom:0; right:0; margin: 0px 20px 20px 0px; border: 2px solid gray; border-radius: 20px; font-size:1rem; padding:10px; width:max-content; z-index: 99999999; background:${bColor}; color:white;">${text}</p>`));
        if (duration != "perm") {
            CUR_MSG_TIMEOUT_ID = setTimeout(rm_msg, duration);
        }

        function rm_msg()
        {
            try {document.querySelector(`#custMsg`).remove()} catch(err) {}
            try {clearTimeout(CUR_MSG_TIMEOUT_ID)} catch(err) {}
        }
    }
})();