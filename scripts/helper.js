let controller;
let fileOptionPanel = document.querySelector('.file_menu');
let queueContent = document.querySelector('.queue_content');
let queueTaskList = document.querySelector('#queue-task-list');
let previewNameElem = document.querySelector('#preview-name');
let previewLoadLevl = document.querySelector('#preview-loaded');
let previewEmbedElem = document.querySelector('#preview-embed');


// function sendNotification(body, tag = 'filebox') {
//     let enabled = Notification.permission === 'granted';
//     if (!enabled) {
//         return;
//     }
//     new Notification("Filebox", {
//         body: body,
//         tag: tag || 'filebox',
//         icon: '/assets/icon.png',
//     });
// }

function dateStringToTimestamp(dateString) {
    let date = new Date(dateString);
    return date.getTime();
}

function sortFileByTimestamp(data) {
    data = data.filter((file) => {
        return !(file.type === 'folder');
    });
    data = data.sort((a, b) => {
        return dateStringToTimestamp(b.date) - dateStringToTimestamp(a.date);
    });
    return data;
}

async function passwordToSHA256Hex(str) {
    let digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getAvatarURL(userId, parse=false){
    let username = "";
    if (parse) {
        username = userId.split("-")[1];
    } else {
        username = userId;
    }
    return `https://api.dicebear.com/5.x/initials/svg?chars=1&fontWeight=900&backgroundType=gradientLinear&seed=${username}`; 
}

async function checkFileParentExists(file) {
    let body = {"type": "folder"}
    if (!file.parent) {
        return false;
    }
    let fragments = file.parent.split("/");
    if (fragments.length === 1) {
        body["name"] = file.parent;
    } else {
        body["name"] = fragments[fragments.length - 1];
        body["parent"] = fragments.slice(0, fragments.length - 1).join("/");
    }
    let resp = await fetch(`/api/query`, {method: "POST", body: JSON.stringify(body)});
    let data = await resp.json();
    if (!data) {
        return false;
    }
    return true;
}

function updateFolderStats(folders) {
    if (folders.length === 0) {
        return;
    }
    fetch(`/api/items/count`, {method: "POST", body: JSON.stringify(folders)})
    .then((resp) => resp.json())
    .then((stats) => {
        stats.forEach((stat) => {
            let statElem = document.getElementById(`stat-${stat.hash}`);
            if (statElem) {
                let old = statElem.innerHTML;
                statElem.innerHTML = `${stat.count} items • ${old}`
            }
        }); 
    })  
}

function handleSizeUnit(size) {
    if (size === undefined) {
        return "~";
    }
    if (size < 1024) {
        return size + " B";
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + " KB";
    } else if (size < 1024 * 1024 * 1024) {
        return (size / 1024 / 1024).toFixed(2) + " MB";
    } else {
        return (size / 1024 / 1024 / 1024).toFixed(2) + " GB";
    }
}

function formatDateString(date) {
    let d = new Date(date);
    return d.getDate()
        + "/" + (d.getMonth() + 1)
        + "/" + d.getFullYear()
        + " " + d.getHours()
        + ":" + d.getMinutes()
        + ":" + d.getSeconds();
}

function updateSpaceUsage(incr) {
    globalConsumption += incr;
    totalSizeWidget.innerText = `${handleSizeUnit(globalConsumption)}`;
}

function setIconByMime(mime, elem) {
    if (mime === undefined) {
        elem.innerHTML = `<span class="material-symbols-rounded">folder</span>`;
    } else if (mime.startsWith("image")) {
        elem.innerHTML = `<span class="material-symbols-rounded">image</span>`;
    } else if (mime.startsWith("video")) {
        elem.innerHTML = `<span class="material-symbols-rounded">movie</span>`;
    } else if (mime.startsWith("audio")) {
        elem.innerHTML = `<span class="material-symbols-rounded">music_note</span>`;
    } else if (mime.startsWith("text")) {
        elem.innerHTML = `<span class="material-symbols-rounded">text_snippet</span>`;
    } else if (mime.startsWith("application/pdf")) {
        elem.innerHTML = `<span class="material-symbols-rounded">book</span>`;
    } else if (mime.startsWith("application/zip")) {
        elem.innerHTML = `<span class="material-symbols-rounded">archive</span>`;
    } else if (mime.startsWith("application/x-rar-compressed")) {
        elem.innerHTML = `<span class="material-symbols-rounded">archive</span>`;
    } else if (mime.startsWith("font")) {
        elem.innerHTML = `<span class="material-symbols-rounded">format_size</span>`;
    } else {
        elem.innerHTML = `<span class="material-symbols-rounded">draft</span>`;
    }
}

function handleTrashFileMenuClick(file) {
    fileOptionPanel.innerHTML = "";
    fileOptionPanel.id = `panel-${file.hash}`;
    if (window.innerWidth < 768) {
        blurLayer.style.display = 'block';
    }
    let title = document.createElement("div");
    title.className = "title";
    let fileNameElem = document.createElement("p");
    fileNameElem.innerHTML = file.name;
    title.appendChild(fileNameElem);
    let close = document.createElement("i");
    close.className = `fa-solid fa-chevron-down`;
    close.addEventListener("click", () => {
        fileOptionPanel.style.display = 'none';
        blurLayer.style.display = 'none';
    });
    title.appendChild(close);
    fileOptionPanel.appendChild(title);
    let restore = document.createElement("div");
    restore.className = "file_menu_option";
    restore.innerHTML = `<p>Restore</p><span class="material-symbols-rounded">replay</span>`;
    restore.addEventListener("click", () => {
        checkFileParentExists(file)
        .then((exists) => {
            if (!exists && file.parent !== undefined) {
                showSnack(`Parent not found. Restoring to root`, colorOrange, 'warning');
                delete file.parent;
                delete file.deleted;
            } else {
                delete file.deleted;
            }
            file.project_id = globalProjectId;
            fetch(`/api/metadata/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
            .then(() => {
                showSnack(`Restored ${file.name}`, colorGreen, 'success');
                document.getElementById(`file-${file.hash}`).remove();
                close.click();
                globalTrashFiles = globalTrashFiles.filter((f) => f.hash !== file.hash);
                if (globalTrashFiles.length === 0) {
                    renderOriginalNav();
                }
            })
        })
    });
    let deleteButton = document.createElement("div");
    deleteButton.className = "file_menu_option";
    deleteButton.innerHTML = `<p>Delete Permanently</p><span class="material-symbols-rounded">delete_forever</span>`;
    deleteButton.addEventListener("click", () => {
        file.project_id = globalProjectId;
        fetch(`/api/metadata/${globalUserPassword}`, {method: "DELETE", body: JSON.stringify(file)})
        .then(() => {
            showSnack(`Permanently deleted ${file.name}`, colorRed, 'info');
            document.getElementById(`file-${file.hash}`).remove();
            if (!file.shared) {
                updateSpaceUsage(-file.size);
            }
            close.click();
            globalTrashFiles = globalTrashFiles.filter((f) => f.hash !== file.hash);
            if (globalTrashFiles.length === 0) {
                renderOriginalNav();
            }
        })
    });
    fileOptionPanel.appendChild(restore);
    fileOptionPanel.appendChild(deleteButton);
    fileOptionPanel.style.display = 'flex';
}

function handleFileMenuClick(file) {
    fileOptionPanel.innerHTML = "";
    fileOptionPanel.id = `panel-${file.hash}`;
    if (window.innerWidth < 768) {
        blurLayer.style.display = 'block';
    }
    let title = document.createElement("div");
    title.className = "title";
    let fileNameElem = document.createElement("p");
    fileNameElem.innerHTML = file.name;
    title.appendChild(fileNameElem);
    let bookmark = document.createElement("i");
    if (file.pinned) {
        bookmark.className = `fa-solid fa-bookmark`;
    } else {
        bookmark.className = `fa-regular fa-bookmark`;
    }
    bookmark.addEventListener("click", () => {
        if (file.pinned) {
            fetch(`/api/bookmark/${file.hash}/${globalUserPassword}`, {method: "DELETE"})
            .then(() => {
                showSnack(`Unpinned successfully`, colorOrange, 'info');
                let card = document.getElementById(`card-${file.hash}`);
                if (card) {
                    card.remove();
                }
                bookmark.className = `fa-regular fa-bookmark`;
                delete file.pinned;
            })
        } else {
            fetch(`/api/bookmark/${file.hash}/${globalUserPassword}`, {method: "POST"})
            .then(() => {
                showSnack(`Pinned successfully`, colorGreen, 'success');
                let pins = document.querySelector('.pinned_files');
                if (pins) {
                    pins.appendChild(newFileElem(file));
                }
                bookmark.className = `fa-solid fa-bookmark`;
                file.pinned = true;
            })
        }
    });
    title.appendChild(bookmark);
    let visibility = document.createElement("i");
    if (file.access === "private") {
        visibility.className = `fa-solid fa-eye-slash`;
    } else {
        visibility.className = `fa-solid fa-eye`;
    }
    visibility.addEventListener("click", () => {
        if (file.access === 'private') {
            visibility.className = `fa-solid fa-eye`;
            file.access = 'public';
            share.style.opacity = 1;
            if (file.size > 1024 * 1024 * 4) {
                embed.style.opacity = 0.3;
            } else {
                embed.style.opacity = 1;
            }
            showSnack("File access changed to public", colorGreen, 'info');
        } else {
            visibility.className = `fa-solid fa-eye-slash`;
            file.access = 'private';
            share.style.opacity = 0.3;
            embed.style.opacity = 0.3;
            showSnack("File access changed to private", colorOrange, 'info');
        }
        fetch(`/api/file/access/${globalUserPassword}`, {
            method: "PATCH", 
            body: JSON.stringify({hash: file.hash, access: file.access})
        })
    });
    if (file.type !== "folder") {
        title.appendChild(visibility);
    }
    let close = document.createElement("i");
    close.className = `fa-solid fa-chevron-down`;
    close.addEventListener("click", () => {
        fileOptionPanel.style.display = 'none';
        blurLayer.style.display = 'none';
    });
    title.appendChild(close);
    fileOptionPanel.appendChild(title);
    let send = document.createElement("div");
    send.className = "file_menu_option";
    send.innerHTML = `<p>Send</p><span class="material-symbols-rounded">send</span>`;
    if (file.type !== "folder") {
        send.addEventListener("click", () => {
            if (file.owner) {
                showSnack("Can't send a file that you don't own", colorOrange, 'info');
                return;
            }
            fetch(`/api/discovery/${globalUserId}/status`)
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 1) {
                    renderFileSenderModal(file);
                } else {
                    showSnack("Please enable discovery to send files", colorOrange, 'info');
                }
            })  
        });
        fileOptionPanel.appendChild(send);
    }
    let rename = document.createElement("div");
    rename.className = "file_menu_option";
    rename.innerHTML = `<p>Rename</p><span class="material-symbols-rounded">edit</span>`;
    rename.addEventListener("click", () => {
        fileNameElem.contentEditable = true;
        fileNameElem.spellcheck = false;
        fileNameElem.focus();
        fileNameElem.addEventListener('blur', (e) => {
            fileNameElem.contentEditable = false;
            if (file.name === fileNameElem.innerText) {
                return;
            }
            let extPattern = /\.[0-9a-z]+$/i;
            let oldext = extPattern.exec(file.name);
            oldext = oldext ? oldext[0] : '';
            let newext = extPattern.exec(fileNameElem.innerText);
            newext = newext ? newext[0] : '';
            fileNameElem.contentEditable = false;
            if (oldext !== newext) {
                e.target.innerHTML = file.name;
                showSnack("File extension cannot be changed", colorOrange, 'warning');
                return;
            }
            fetch(`/api/rename/${globalUserPassword}`, {
                method: "POST", 
                body: JSON.stringify({hash: file.hash, name: fileNameElem.innerText})
            })
            .then((res) => {
                if (res.status === 200) {
                    file.name = fileNameElem.innerText;
                    document.querySelector(`#filename-${file.hash}`).innerHTML = file.name;
                    showSnack(`File renamed to ${file.name}`, colorGreen, 'success');
                }
            })
        });
    });
    let downloadButton = document.createElement("div");
    downloadButton.className = "file_menu_option";
    downloadButton.innerHTML = `<p>Download</p><span class="material-symbols-rounded">download</span>`;
    downloadButton.addEventListener("click", () => {
        close.click();
        if (file.shared === true) {
            downloadShared(file);
            return;
        }
        download(file);
    });
    let share = document.createElement("div");
    share.className = "file_menu_option";
    share.innerHTML = `<p>Share Link</p><span class="material-symbols-rounded">link</span>`;
    share.addEventListener("click", () => {
        if (file.access === "private") {
            showSnack(`Make file public to share via link`, colorOrange, 'warning');
        } else {
            window.navigator.clipboard.writeText(`${window.location.origin}/shared/${file.hash}`)
            .then(() => {
                showSnack(`Copied sharing link to clipboard`, colorGreen, 'success');
            })
        }
    });
    let embed = document.createElement("div");
    embed.className = "file_menu_option";
    embed.innerHTML = `<p>Embed</p><span class="material-symbols-rounded">code</span>`;
    embed.addEventListener("click", () => {
        if (file.access === "private") {
            showSnack(`Make file public to embed`, colorOrange, 'warning');
        } else if (file.size > 1024 * 1024 * 4) {
            showSnack(`File is too large to embed`, colorRed, 'error');
        } else {
            window.navigator.clipboard.writeText(`${window.location.origin}/api/embed/${file.hash}`)
            .then(() => {
                showSnack(`Copied embed link to clipboard`, colorGreen, 'success');
            })
        }
    });
    let move = document.createElement("div");
    move.className = "file_menu_option";
    move.innerHTML = `<p>Move</p><span class="material-symbols-rounded">arrow_forward</span>`;
    move.addEventListener("click", () => {
        close.click();
        renderAuxNav(fileMover(file));
        isFileMoving = true;
        browseButton.click();
    });
    if (file.type !== 'folder') {
        fileOptionPanel.appendChild(rename);
        fileOptionPanel.appendChild(downloadButton);
        if (file.access === 'private') {
            share.style.opacity = 0.3;
        }
        fileOptionPanel.appendChild(share);
        if (file.access === 'private' || file.size > 1024 * 1024 * 4) {
            embed.style.opacity = 0.3;
        }
        fileOptionPanel.appendChild(embed);
        fileOptionPanel.appendChild(move);
    }
    let trashButton = document.createElement("div");
    trashButton.className = "file_menu_option";
    if (file.type === 'folder') {
        trashButton.innerHTML = `<p>Delete Permanently</p><span class="material-symbols-rounded">delete_forever</span>`;
    } else {
        trashButton.innerHTML = `<p>Trash</p><span class="material-symbols-rounded">delete_forever</span>`;
    }
    trashButton.addEventListener("click", () => {
        file.project_id = globalProjectId;
        if (file.type === 'folder') {
            fetch(`/api/metadata/${globalUserPassword}`, {method: "DELETE", body: JSON.stringify(file)})
            .then((resp) => {
                if (resp.status === 409) {
                    showSnack(`Folder is not empty`, colorOrange, 'warning');
                    close.click();
                    return;
                }
                if (resp.status === 200) {
                    showSnack(`Permanently Deleted ${file.name}`, colorRed, 'warning');
                    document.getElementById(`file-${file.hash}`).remove();
                    close.click();
                } 
            })
        } else {
            file.deleted = true;
            fetch(`/api/metadata/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
            .then(() => {
                showSnack(`Moved to trash ${file.name}`, colorRed, 'warning');
                document.getElementById(`file-${file.hash}`).remove();
                close.click();
            })
        }
    });
    fileOptionPanel.appendChild(trashButton);
    fileOptionPanel.style.display = 'flex';
}

function handleFolderClick(folder) {
    fileOptionPanel.style.display = 'none';
    globalContextFolder = folder;
    if (globalFolderQueue.length > 0) {
        let lastFolder = globalFolderQueue[globalFolderQueue.length - 1];
        if (lastFolder.hash !== folder.hash) {
            globalFolderQueue.push(folder);
        }
    } else {
        globalFolderQueue.push(folder);
    }
    let parentOf;
    if (folder.parent) {
        parentOf = `${folder.parent}/${folder.name}`;
    } else {
        parentOf = folder.name;
    }
    fetch(`/api/folder`, {
        method: "POST",
        body: JSON.stringify({parent: parentOf})
    })
    .then(res => res.json())
    .then(data => {
        let ul = document.createElement('ul');
        ul.id = 'folder-view';
        let folders = data.filter((file) => file.type === 'folder');
        let files = data.filter((file) => file.type !== 'folder');
        folders.forEach((folder) => {
            ul.appendChild(newFileElem(folder));
        });
        files.forEach((file) => {
            ul.appendChild(newFileElem(file));
        });
        let fileList = document.createElement('div');
        fileList.className = 'file_list';
        fileList.appendChild(ul);
        let fileView = document.createElement('div');
        fileView.className = 'my_files';
        fileView.innerHTML = '';
        fileView.appendChild(buildPrompt(files));
        fileView.appendChild(fileList);
        mainSection.innerHTML = '';
        mainSection.appendChild(fileView);
        updateFolderStats(folders);
        updatePromptFragment(folder.name);
    })
}

function newFileElem(file, isTrash = false) {
    let li = document.createElement('li');
    li.id = `file-${file.hash}`
    let fileIcon = document.createElement('div');
    if (file.type === 'folder' || file.color) {
        fileIcon.style.color = file.color;
    }
    let pickerElem = document.createElement("input");
    pickerElem.type = "color";
    pickerElem.style.display = "none";
    pickerElem.value = file.color || "#ccc";
    pickerElem.addEventListener("change", () => {
        file.color = pickerElem.value;
        file.project_id = globalProjectId;
        fetch(`/api/metadata/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
        .then(() => {
            fileIcon.style.color = file.color;
            showSnack(`Folder color changed successfully`, colorGreen, 'success');
        })
    });
    fileIcon.appendChild(pickerElem);
    fileIcon.className = 'file_icon';
    setIconByMime(file.mime, fileIcon);
    fileIcon.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (file.type === 'folder') {
            pickerElem.click();
            return;
        }
        if (!document.querySelector('.multi_select_options')) {
            let multiSelectOptions = document.createElement('div');
            multiSelectOptions.className = 'multi_select_options';
            let moveButton = document.createElement('button');
            moveButton.innerHTML = 'Move';
            moveButton.addEventListener("click", () => {
                isFileMoving = true;
                browseButton.click();
                let fileMover = document.createElement('div');
                fileMover.className = 'file_mover';
                let cancelButton = document.createElement('button');
                cancelButton.innerHTML = 'Cancel';
                cancelButton.addEventListener('click', () => {
                    renderOriginalNav();
                });
                let selectButton = document.createElement('button');
                selectButton.innerHTML = 'Select';
                selectButton.style.backgroundColor = 'var(--color-blueish)';
                selectButton.addEventListener('click', () => {
                    globalMultiSelectBucket.forEach((file) => {
                        delete file.deleted;
                    });
                    if (!globalContextFolder) {
                        globalMultiSelectBucket.forEach((file) => {
                            delete file.parent;
                        });
                    } else {
                        globalMultiSelectBucket.forEach((file) => {
                            if (globalContextFolder.parent) {
                                file.parent = `${globalContextFolder.parent}/${globalContextFolder.name}`;
                            } else {
                                file.parent = globalContextFolder.name;
                            }
                        });
                    }
                    fetch(`/api/bulk/${globalUserPassword}`, {
                        method: "PATCH", 
                        body: JSON.stringify(globalMultiSelectBucket)}
                    )
                    .then(() => {
                        showSnack('Files Moved Successfully', colorGreen, 'success');
                        if (globalContextFolder) {
                            renderOriginalNav();
                            handleFolderClick(globalContextFolder);
                        } else {
                            isFileMoving = false;
                            browseButton.click();
                        }
                    })
                });
                let p = document.createElement('p');
                p.innerHTML = 'Select Move Destination';
                fileMover.appendChild(cancelButton);
                fileMover.appendChild(p);
                fileMover.appendChild(selectButton);
                renderAuxNav(fileMover);
                globalMultiSelectBucketUpdated = true;
            });
            let privateButton = document.createElement('button');
            privateButton.innerHTML = 'Private';
            privateButton.addEventListener("click", () => {
                globalMultiSelectBucket.forEach((file) => {
                    file.access = 'private';
                });
                fetch(`/api/bulk/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
                .then(() => {
                    showSnack(`Made selected files private`, colorOrange, 'info');
                })
            });
            let publicButton = document.createElement('button');
            publicButton.innerHTML = 'Public';
            publicButton.addEventListener("click", () => {
                globalMultiSelectBucket.forEach((file) => {
                    file.access = 'public';
                });
                fetch(`/api/bulk/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
                .then(() => {
                    showSnack(`Made selected files public`, colorGreen, 'info');
                })
            });
            let deleteButton = document.createElement('button');
            deleteButton.innerHTML = 'Delete';
            deleteButton.style.backgroundColor = colorRed;
            deleteButton.addEventListener("click", () => {
                let confirmation = confirm('Are you sure you want to delete these files permanently?');
                if (!confirmation) {
                    return;
                }
                fetch(`/api/bulk/${globalUserPassword}`, {method: "DELETE", body: JSON.stringify(globalMultiSelectBucket)})
                .then(() => {
                    globalMultiSelectBucket.forEach((file) => {
                        let fileElem = document.getElementById(`file-${file.hash}`);
                        fileElem.remove();
                    });
                    showSnack(`Deleted selected files`, colorRed, 'info');
                    renderOriginalNav();
                })
            });
            multiSelectOptions.appendChild(moveButton);
            multiSelectOptions.appendChild(privateButton);
            multiSelectOptions.appendChild(publicButton);
            multiSelectOptions.appendChild(deleteButton);
            renderAuxNav(multiSelectOptions);
        }
        if (globalMultiSelectBucket.length === 25) {
            showSnack(`Can't select more than 25 items`, colorOrange, 'warning');
            return;
        } else {
            li.style.backgroundColor = "rgba(255, 255, 255, 0.055)";
            let checkIcon = document.createElement('span');
            checkIcon.className = 'material-symbols-rounded';
            checkIcon.innerHTML = 'done';
            checkIcon.style.color = 'rgb(30, 112, 30)';
            checkIcon.style.backgroundColor = 'var(--color-blackish-hover)';
            checkIcon.style.borderRadius = '50%';
            checkIcon.style.padding = '5px';
            checkIcon.style.fontSize = '20px';
            fileIcon.innerHTML = '';
            fileIcon.appendChild(checkIcon);
            let index = globalMultiSelectBucket.findIndex((f) => f.hash === file.hash);
            if (index === -1) {
                globalMultiSelectBucket.push(file);
            } else {
                globalMultiSelectBucket.splice(index, 1);
                li.style.backgroundColor = "transparent";
                setIconByMime(file.mime, fileIcon)
            }
            if (globalMultiSelectBucket.length === 0) {
                renderOriginalNav();
            }
        }
    });
    let fileInfo = document.createElement('div');
    fileInfo.className = 'info';
    let fileName = document.createElement('p');
    fileName.innerHTML = file.name;
    fileName.id = `filename-${file.hash}`;
    let fileSizeAndDate = document.createElement('p');
    fileSizeAndDate.style.fontSize = '11px';
    fileSizeAndDate.id = `stat-${file.hash}`;
    if (file.type === 'folder') {
        fileSizeAndDate.innerHTML = `${formatDateString(file.date)}`;
    } else {
        fileSizeAndDate.innerHTML = `${handleSizeUnit(file.size)} • ${formatDateString(file.date)}`;
    }
    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSizeAndDate);
    li.appendChild(fileIcon);
    li.appendChild(fileInfo);
    let menuOptionSpan = document.createElement('span');
    menuOptionSpan.className = 'material-symbols-rounded';
    menuOptionSpan.innerHTML = "more_horiz";
    menuOptionSpan.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (fileOptionPanel.style.display === 'flex' && fileOptionPanel.id === `panel-${file.hash}`) {
            fileOptionPanel.style.display = 'none';
            return;
        }
        if (isTrash) {
            handleTrashFileMenuClick(file);
        } else {
            handleFileMenuClick(file);
        }
    });
    li.appendChild(menuOptionSpan);
    li.addEventListener('click', () => {
        if (file.type === 'folder') {
            handleFolderClick(file);
        } else {
            showFilePreview(file);
        }
    });
    li.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        let prevFile = document.getElementById(`file-${cm.id}`);
        if (prevFile) {
            prevFile.style.backgroundColor = 'transparent';
        }
        renderFileContextMenu(ev, file);
    });
    return li;
}

function buildPinnedContent(data) {
    let ul = document.createElement('ul');
    ul.className = 'pinned_files';
    data.forEach((file) => {
        let elem = newFileElem(file);
        elem.id = `card-${file.hash}`;
        ul.appendChild(elem);
    });
    let fileList = document.createElement('div');
    fileList.className = 'file_list';
    fileList.appendChild(ul);
    return fileList;
}

function buildRecentContent(data) {
    let ul = document.createElement('ul');
    ul.className = 'recent_files';
    data.forEach((file) => {
        if (file.parent !== '~shared') {
            ul.appendChild(newFileElem(file));
        }
    });
    let fileList = document.createElement('div');
    fileList.className = 'file_list';
    fileList.appendChild(ul);
    return fileList;
}

function buildFileBrowser(data) {
    let ul = document.createElement('ul');
    ul.className = 'all_files';
    data.forEach((file) => {
        ul.appendChild(newFileElem(file));
    });
    let fileList = document.createElement('div');
    fileList.className = 'file_list';
    fileList.appendChild(ul);
    return fileList;
}

function updatePromptFragment(text = 'home') {
    let fragment;
    if (text === 'home') {
        fragment = 'Home';
    } else {
        fragment = text
    }
    document.querySelector('.fragment').innerHTML = fragment;
}

function buildPrompt(files) {
    let prompt = document.createElement('div');
    prompt.className = 'prompt';
    let fragment = document.createElement('p');
    fragment.className = 'fragment';
    let div = document.createElement('div');
    let backButton = document.createElement('i');
    backButton.className = 'material-symbols-rounded';
    backButton.innerHTML = 'arrow_back';
    backButton.addEventListener('click', () => {
        if (!isFileMoving) {
            globalMultiSelectBucket = [];
        }
        if (globalFolderQueue.length === 0) {
            globalContextFolder = null;
            return;
        }
        if (globalFolderQueue.length > 1) {
            globalFolderQueue.pop();
            handleFolderClick(globalFolderQueue[globalFolderQueue.length - 1]);
        } else {
            globalContextFolder = null;
            globalFolderQueue.pop();
            getContextOptionElem().click();
        }
    });
    let selectAll = document.createElement('i');
    selectAll.className = 'material-symbols-rounded';
    selectAll.innerHTML = 'select_all';
    selectAll.addEventListener('click', () => {
        let files25 = files.slice(0, 25);
        files25.forEach((file) => {
            let elem = document.getElementById(`file-${file.hash}`);
            elem.firstElementChild.click();
        });
    });
    prompt.appendChild(backButton);
    div.appendChild(fragment);
    div.appendChild(selectAll);
    prompt.appendChild(div);
    return prompt;
}

function prependQueueElem(file, isUpload = true) {
    let li = document.createElement('li');
    let icon = document.createElement('div');
    icon.className = 'icon';
    setIconByMime(file.mime, icon);
    let info = document.createElement('div');
    info.className = 'info';
    let name = document.createElement('p');
    name.innerHTML = file.name;
    let progress = document.createElement('div');
    progress.className = 'progress';
    let bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = '0%';
    if (isUpload) {
        bar.style.backgroundColor = colorBlue;
    } else {
        bar.style.backgroundColor = colorGreen;
    }
    bar.id = `bar-${file.hash}`;
    progress.appendChild(bar);
    info.appendChild(name);
    info.appendChild(progress);
    let percentage = document.createElement('p');
    percentage.innerHTML = '0%';
    percentage.id = `percentage-${file.hash}`;
    li.appendChild(icon);
    li.appendChild(info);
    li.appendChild(percentage);
    queueTaskList.prepend(li);
}

function updateToCompleted(hash) {
    let icon = document.querySelector(`#icon-${hash}`);
    icon.className = 'fa-solid fa-check-circle';
    icon.style.color = '#279627';
}

let snackTimer = null;
function showSnack(text, color=colorGreen, type='success') {
    let icons = {
        success: 'fa-solid fa-check-circle',
        error: 'fa-solid fa-xmark',
        warning: 'fa-solid fa-exclamation-triangle',
        info: 'fa-solid fa-info-circle'
    }
    let snackbar = document.querySelector('.snackbar');
    snackbar.style.display = 'flex';
    snackbar.innerHTML = `
    <div class="snack_content" style="background-color: ${color}">
        <i class="${icons[type]}"></i>
        <p>${text}</p>
    </div>`;
    if (snackTimer) {
        clearTimeout(snackTimer);
    }
    snackTimer = setTimeout(() => {
        snackbar.style.display = 'none';
    }, 3000);
}

function renderFilesByMime(query) {
    sidebarOptionSwitch();
    query['deleted?ne'] = true;
    fetch("/api/query", {method: "POST", body: JSON.stringify(query)})
    .then(response => response.json())
    .then(data => {
        mainSection.innerHTML = '';
        if (!data) {
            showSnack('No files found of this type', colorOrange, 'warning');
            return;
        }
        let fileList = document.createElement('div');
        fileList.className = 'file_list';
        let ul = document.createElement('ul');
        ul.className = 'all_files';
        data.forEach((file) => {
            ul.appendChild(newFileElem(file));
        });
        fileList.appendChild(ul);
        mainSection.appendChild(fileList);
    });
}

async function loadSharedFile(file, controller) {
    let size = file.size;
    const chunkSize = 1024 * 1024 * 4
    if (size < chunkSize) {
        let resp = await fetch(`/api/external/${globalUserId}/${file.owner}/${file.hash}/0`, {signal: controller.signal});
        return await resp.blob();
    } else {
        let skips = 0;
        let progress = 0;
        let loadingLevel = document.querySelector('#loading-amount');
        if (size % chunkSize === 0) {
            skips = size / chunkSize;
        } else {
            skips = Math.floor(size / chunkSize) + 1;
        }
        let heads = Array.from(Array(skips).keys());
        let promises = [];
        heads.forEach((head) => {
            promises.push(
                fetch(`/api/external/${globalUserId}/${file.owner}/${file.hash}/${head}`)
                .then((resp) => {
                    return resp.blob();
                })
                .then((blob) => {
                    progress += blob.size;
                    let percentage = Math.floor((progress / size) * 100);
                    loadingLevel.innerHTML = `${percentage}%`;
                    return blob;
                })
            );
        });
        let blobs = await Promise.all(promises);
        return new Blob(blobs, {type: file.mime});
    }
}


// this will suck at large files
// will implement streaming later
// this is just a basic implementation
async function showFilePreview(file) {
    let a = previewDownloadButton.firstElementChild;
    a.href = '';
    a.style.opacity = '0.5';
    a.style.pointerEvents = 'none';
    controller = new AbortController();
    globalPreviewFile = file;
    previewModal.style.display = 'flex';
    previewNameElem.innerHTML = file.name;
    let embed = document.createElement('embed');
    embed.type = file.mime;
    let src;
    if (file.shared) {
        loadSharedFile(file, controller).then((blob) => {
            src = URL.createObjectURL(blob);
        });
    }
    let extRegex = /(?:\.([^.]+))?$/;
    let extension = extRegex.exec(file.name);
    if (extension && extension[1]) {
        extension = extension[1];
    } else {
        extension = '';
    }
    let filename;
    if (extension === '') {
        filename = file.hash;
    } else {
        filename = `${file.hash}.${extension}`
    }
    let projectId = globalSecretKey.split("_")[0];
    let url = `https://drive.deta.sh/v1/${projectId}/filebox/files/download?name=${filename}`;
    const response = await fetch(url, { 
        headers: {"X-Api-Key": globalSecretKey},
        signal: controller.signal
    });
    let progress = 0;
    const reader = response.body.getReader();
    const stream = new ReadableStream({
        start(controller) {
            return pump();
            function pump() {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(value);
                    progress += value.length;
                    previewLoadLevl.innerHTML = `${Math.round((progress / file.size) * 100)}%`;
                    return pump();
                });
            }
        }
    });
    const br = new Response(stream);
    const blob = await br.blob();
    src = URL.createObjectURL(new Blob([blob], {type: file.mime}));
    embed.src = src;
    a.href = src;
    a.download = file.name;
    a.style.opacity = '1';
    a.style.pointerEvents = 'auto';
    previewModal.appendChild(embed);
}

function fileMover(file) {
    let fileMover = document.createElement('div');
    fileMover.className = 'file_mover';
    let cancelButton = document.createElement('button');
    cancelButton.innerHTML = 'Cancel';
    cancelButton.addEventListener('click', () => {
        renderOriginalNav();
    });
    let selectButton = document.createElement('button');
    selectButton.innerHTML = 'Select';
    selectButton.style.backgroundColor = 'var(--color-blueish)';
    selectButton.addEventListener('click', () => {
        if (!globalContextFolder) {
            delete file.parent;
        } else {
            if (globalContextFolder.parent) {
                file.parent = `${globalContextFolder.parent}/${globalContextFolder.name}`;
            } else {
                file.parent = globalContextFolder.name;
            }
        }
        file.project_id = globalProjectId;
        fetch(`/api/metadata/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
        .then(() => {
            if (globalContextFolder) {
                renderOriginalNav();
                if (document.querySelector(`#file-${file.hash}`)) {
                    showSnack('File is already here', colorOrange, 'info');
                    return;
                }   
                showSnack('File Moved Successfully', colorGreen, 'success');
                document.querySelector('#folder-view').appendChild(newFileElem(file))
            } else {
                isFileMoving = false;
                browseButton.click();
            }
        })
    });
    let p = document.createElement('p');
    p.innerHTML = 'Select Move Destination';
    fileMover.appendChild(cancelButton);
    fileMover.appendChild(p);
    fileMover.appendChild(selectButton);
    return fileMover;
}

function buildDynamicNavIcon() {
    let icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.id = 'dyn-nav-icon';
    if (window.innerWidth < 768) {
        icon.innerHTML = 'menu';
        icon.style.color = "#ccc"
        icon.style.padding = '0px 10px';
        icon.addEventListener('click', () => {
            blurLayer.style.display = 'block';
            sidebar.style.display = 'flex';
        });
    } else {
        icon.innerHTML = 'search';
        icon.style.color = "var(--color-blueish)";
        icon.style.padding = '0px';
        icon.style.paddingRight = '10px';
    }
    return icon;
}

function renderSearchResults(query) {
    if (query.length === 0) {
        return;
    }
    fetch(`/api/query`, {
        method: "POST",
        body: JSON.stringify({"name?contains": query}),
    })
    .then(response => response.json())
    .then(data => {
        if (window.innerWidth < 768) {
            sidebarState(false);
        }
        let resultsPage = document.createElement('div');
        resultsPage.className = 'my_files';
        if (!data) {
            mainSection.innerHTML = '';
            let p = document.createElement('p');
            let symbol = `<i class="fa-solid fa-circle-exclamation"></i> `;
            p.innerHTML = `${symbol} No results found for *${query}*`;
            p.style.backgroundColor = "#e44d27";
            resultsPage.appendChild(p);
            mainSection.appendChild(resultsPage);
            fileOptionPanel.style.display = 'none';
            return;
        }
        let absoluteResults = data.filter((file) => {
            if (file.name.startsWith(query)) {
                data.splice(data.indexOf(file), 1);
                return true;
            } else {
                return false;
            }
        });
        data = absoluteResults.concat(data);
        let p = document.createElement('p');
        p.innerHTML = `Search results for *${query}*`;
        p.style.backgroundColor = "#317840";
        resultsPage.appendChild(p);
        let fileList = document.createElement('div');
        fileList.className = 'file_list';
        let ul = document.createElement('ul');
        ul.className = 'all_files';
        data.forEach((file) => {
            ul.appendChild(newFileElem(file));
        });
        fileList.appendChild(ul);
        resultsPage.appendChild(fileList);
        mainSection.innerHTML = '';
        mainSection.appendChild(resultsPage);
        fileOptionPanel.style.display = 'none';
    })
}

function renderOriginalNav() {
    isFileMoving = false;
    globalMultiSelectBucket = [];
    navBar.style.paddingLeft = '10px';
    navBar.style.paddingRight = '10px';
    let icon = buildDynamicNavIcon();
    let inputBar = document.createElement('input');
    inputBar.type = 'text';
    inputBar.placeholder = 'Search in Drive';
    inputBar.spellcheck = false;
    inputBar.autocomplete = 'on'; 
    let inputTimer = null;
    inputBar.addEventListener('focus', () => {
        if (inputBar.value.length > 0) {
            renderSearchResults(inputBar.value);
        }
    });
    inputBar.addEventListener('input', (ev) => {
        if (inputTimer) {
            clearTimeout(inputTimer);
        }
        inputTimer = setTimeout(() => {
            renderSearchResults(ev.target.value);
        }, 500);
    });
    let newFolderButton = document.createElement('button');
    newFolderButton.innerHTML = '<span class="material-symbols-rounded">create_new_folder</span>';
    newFolderButton.addEventListener('click', () => {
        createFolder();
    });
    let newHiddenFolderInput = document.createElement('input');
    newHiddenFolderInput.type = 'file';
    newHiddenFolderInput.multiple = true;
    newHiddenFolderInput.style.display = 'none';
    newHiddenFolderInput.webkitdirectory = true;
    newHiddenFolderInput.addEventListener('change', (ev) => {
        let relativePaths = [];
        for (let i = 0; i < ev.target.files.length; i++) {
            relativePaths.push(ev.target.files[i].webkitRelativePath);
        }
        let uniqueFolders = [];
        for (let i = 0; i < relativePaths.length; i++) {
            let folderPath = relativePaths[i].split('/');
            folderPath.pop();
            folderPath = folderPath.join('/');
            if (!uniqueFolders.includes(folderPath)) {
                uniqueFolders.push(folderPath);
            }
        }
        let parents = [];
        uniqueFolders.forEach((folder) => {
            let folderPath = folder.split('/');
            let currentPath = '';
            folderPath.forEach((folder) => {
                currentPath += folder + '/';
                if (!parents.includes(currentPath)) {
                    parents.push(currentPath);
                }
            });
        });
        let strippedParents = parents.map((parent) => {
            return parent.slice(0, -1);
        });
        strippedParents.forEach((parent) => {
            let relativePath;
            if (globalContextFolder) {
                if (globalContextFolder.parent) {
                    relativePath = `${globalContextFolder.parent}/${globalContextFolder.name}`;
                } else {
                    relativePath = globalContextFolder.name;
                }
            }
            let folderName;
            let folderPath = '';
            if (parent.includes('/')) {
                let parentParts = parent.split('/');
                folderName = parentParts.pop();
                folderPath = `${parentParts.join('/')}`;
            } else {
                folderName = parent;
            }
            if (relativePath && folderPath) {
                folderPath = `${relativePath}/${folderPath}`;
            } else if (relativePath) {
                folderPath = relativePath;
            }
            let body = {
                "name": folderName,
                "type": "folder",
                "hash": randId(),
                "date": new Date().toISOString(),
            }
            if (folderPath) {
                body.parent = folderPath;
            }
            fetch(`/api/metadata/${globalUserPassword}`, {method: "POST", body: JSON.stringify(body)})
        });
        for (let i = 0; i < ev.target.files.length; i++) {
            let file = ev.target.files[i];
            let relativePath = ev.target.files[i].webkitRelativePath;
            let parentFramnets = relativePath.split('/');
            parentFramnets.pop();
            let parent = parentFramnets.join('/');
            if (globalContextFolder) {
                if (globalContextFolder.parent) {
                    parent = `${globalContextFolder.parent}/${globalContextFolder.name}/${parent}`;
                } else {
                    parent = `${globalContextFolder.name}/${parent}`;
                }
            }
            let metadata = {
                "name": file.name,
                "hash": randId(),
                "date": new Date().toISOString(),
                "size": file.size,
                "parent": parent,
                "mime": file.type,
            }
            upload(file, metadata);
        }
    });
    let folderUploadButton = document.createElement('button');
    folderUploadButton.innerHTML = '<span class="material-symbols-rounded">drive_folder_upload</span>';
    folderUploadButton.addEventListener('click', () => {
        newHiddenFolderInput.click();
    });
    let newHiddenFileInput = document.createElement('input');
    newHiddenFileInput.type = 'file';
    newHiddenFileInput.multiple = true;
    newHiddenFileInput.style.display = 'none';
    let newFileButton = document.createElement('button');
    newFileButton.innerHTML = '<span class="material-symbols-rounded">upload_file</span>';
    newFileButton.addEventListener('click', () => {
        newHiddenFileInput.click();
    });
    newHiddenFileInput.addEventListener('change', (ev) => {
        queueButton.click();
        for (let i = 0; i < ev.target.files.length; i++) {
            upload(ev.target.files[i]);
        }
    });
    navBar.innerHTML = '';
    navBar.appendChild(icon);
    navBar.appendChild(inputBar);
    navBar.appendChild(newFolderButton);
    navBar.appendChild(folderUploadButton);
    navBar.appendChild(newFileButton);
    navBar.appendChild(newHiddenFileInput);
    navBar.appendChild(newHiddenFolderInput);
}

function renderAuxNav(elem){
    navBar.style.padding = '0px';
    let wrapper = document.createElement('div');
    wrapper.className = 'other';
    navBar.innerHTML = '';
    wrapper.appendChild(elem);
    navBar.appendChild(wrapper);
}

function buildDiscoveryModal() {
    let discovery = document.createElement('div');
    discovery.className = 'connection';
    let p = document.createElement('p');
    p.innerHTML = 'Enable Discovery?'
    let apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'password';
    apiKeyInput.placeholder = 'API key of your instance';
    let connectButton = document.createElement('button');
    connectButton.innerHTML = '<span class="material-symbols-rounded">wifi_tethering</span>';
    connectButton.addEventListener('click', () => {
        let url = window.location.href;
        let apiKey = apiKeyInput.value;
        if (apiKey.length === 0) {
            showSnack("API key can't be empty", colorOrange, 'warning');
            return;
        }
        let checkbox = document.querySelector('#agree');
        if (!checkbox.checked) {
            showSnack('You must agree to the terms', colorOrange, 'warning');
            return;
        }
        if (url[url.length - 1] === '/') {
            url = url.substring(0, url.length - 1);
        }
        passwordToSHA256Hex(globalUserPassword).then((hash) => {
            fetch(`/api/discovery/${globalUserId}/${hash}`, {
                method: "PUT",
                body: JSON.stringify({
                    "id": globalUserId, 
                    "url": url, 
                    "api_key": apiKey,
                    "enabled": true,
                }),
            })
            .then((resp) => {
                if (resp.status === 200) {
                    showSnack('Discovery enabled', colorGreen, 'success');
                    connectButton.style.color = colorGreen;
                    discoveryButton.style.color = colorGreen;
                    setTimeout(() => {
                        modalContent.innerHTML = '';
                        modal.style.display = 'none';
                    }, 1000);
                    return;
                } else {
                    showSnack('Error enabling discovery. Retry', colorOrange, 'warning');
                    return;
                }
            });
        });
    });
    let span = document.createElement('span');
    span.style.marginTop = '20px';
    span.style.fontSize = '14px';
    span.style.color = '#ccc';
    span.innerHTML = `<input type="checkbox" id="agree"> By enabling discovery, you are agreeing to share your instance\'s URL and API key with other instances.`;
    discovery.appendChild(p);
    discovery.appendChild(apiKeyInput);
    discovery.appendChild(span);
    discovery.appendChild(connectButton);
    return discovery;
}

function renderFileSenderModal(file) {
    fileOptionPanel.style.display = 'none';
    let fileSender = document.querySelector('.file_sender');
    fileSender.innerHTML = '';
    let filename = document.createElement('p');
    filename.innerHTML = file.name;
    let userIdField = document.createElement('input');
    userIdField.placeholder = 'Type user instance id';
    userIdField.type = 'text';
    userIdField.spellcheck = false;
    let timeout = null;
    userIdField.addEventListener('input', (ev) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            if (ev.target.value.length === 0) {
                userIdField.style.color = colorOrange;
                sendButton.disabled = true;
                sendButton.style.opacity = 0.5;
                return;
            }
            fetch(`/api/discovery/${ev.target.value}/status`)
            .then((resp) => resp.json())
            .then((data) => {
                if (data.status === 1) {
                    userIdField.style.color = colorGreen;
                    sendButton.disabled = false;
                    sendButton.style.opacity = 1;
                } else {
                    userIdField.style.color = colorOrange;
                    sendButton.disabled = true;
                    sendButton.style.opacity = 0.5;
                }
            })
        }, 1000);
    });
    let buttons = document.createElement('div');
    let cancelButton = document.createElement('button');
    cancelButton.innerHTML = 'Cancel';
    cancelButton.addEventListener('click', () => {
        fileSender.style.display = 'none';
    });
    let sendButton = document.createElement('button');
    sendButton.innerHTML = 'Send';
    sendButton.style.opacity = 0.5;
    sendButton.disabled = true;
    sendButton.style.backgroundColor = colorGreen;
    sendButton.addEventListener('click', () => {
        if (userIdField.value === globalUserId) {
            showSnack("You can't send a file to yourself", colorOrange, 'warning');
            return;
        }
        let fileClone = JSON.parse(JSON.stringify(file));
        delete fileClone.recipients;
        delete fileClone.pinned;
        fileClone.owner = globalUserId;
        fileClone.pending = true;
        fileClone.shared = true;
        fileClone.parent = "~shared";
        fetch(`/api/push/${userIdField.value}/metadata`, {method: "POST", body: JSON.stringify(fileClone)})
        .then((resp) => {
            if (resp.status !== 207) {
                fileSender.style.display = 'none';
                showSnack('Something went wrong. Please try again', colorRed, 'error');
                return;
            }
            if (file.recipients) {
                if (!file.recipients.includes(userIdField.value)) {
                    file.recipients.push(userIdField.value);
                }
            } else {
                file.recipients = [userIdField.value];
            }
            file.project_id = globalProjectId;
            fetch(`/api/metadata/${globalUserPassword}`, {method: "PATCH", body: JSON.stringify(file)})
            .then((resp) => {
                if (resp.status === 207) {
                    showSnack(`File shared with ${userIdField.value}`, colorGreen, 'success');
                    fileSender.style.display = 'none';
                } else {
                    showSnack('Something went wrong. Please try again', colorRed, 'error');
                }
            })
        })
    });
    buttons.appendChild(cancelButton);
    buttons.appendChild(sendButton);
    fileSender.appendChild(filename);
    fileSender.appendChild(userIdField);
    fileSender.appendChild(buttons);
    fileSender.style.display = 'flex';
}

function buildTitleP(text) {
    let p = document.createElement('p');
    p.innerHTML = text;
    p.style.width = '100%';
    p.style.textAlign = 'left';
    p.style.padding = '10px';
    p.style.fontSize = '18px';
    return p;
}

function buildPendingFileList(files) {
    let sharedFiles = document.createElement('div');
    sharedFiles.className = 'shared_files';
    files.forEach((file) => {
        file.project_id = globalProjectId;
        let pendingFile = document.createElement('div');
        pendingFile.className = 'pending_file';
        let icon = document.createElement('div');
        icon.className = 'icon';
        setIconByMimeType(file.mime, icon);
        let fileInfo = document.createElement('div');
        fileInfo.className = 'file_info';
        let filename = document.createElement('p');
        filename.innerHTML = file.name;
        let details = document.createElement('p');
        details.innerHTML = `Owner: ${file.owner} & Size: ${handleSizeUnit(file.size)}`;
        let buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.width = '100%';
        buttons.style.alignItems = 'center';
        buttons.style.justifyContent = 'flex-end';
        let reject = document.createElement('span');
        reject.className = 'material-symbols-rounded';
        reject.innerHTML = 'close';
        reject.style.color = colorRed;
        reject.addEventListener('click', () => {
            fetch(`/api/metadata/${globalUserPassword}`, {method: "DELETE", body: JSON.stringify(file)})
            .then((res) => {
                if (res.status === 200) {
                    pendingFile.remove();
                    showSnack('File rejected', colorOrange, 'warning')
                } else {
                    showSnack('Something went wrong. Please try again', colorRed, 'error');
                }
            })
        });
        let accept = document.createElement('span');
        accept.className = 'material-symbols-rounded';
        accept.innerHTML = 'check';
        accept.addEventListener('click', () => {
            delete file.pending;
            file.project_id = globalProjectId;
            fetch(`/api/metadata/${globalUserPassword}`, {method: "POST", body: JSON.stringify(file)})
            .then((res) => {
                if (res.status === 207) {
                    showSnack('File accepted', colorGreen, 'success')
                    let fileList = document.querySelector('.all_files');
                    pendingFile.remove();
                    fileList.appendChild(newFileElem(file));
                } else {
                    showSnack('Something went wron. Please try again', colorRed, 'error');
                }
            })
        });
        buttons.appendChild(reject);
        buttons.appendChild(accept);
        fileInfo.appendChild(filename);
        fileInfo.appendChild(details);
        pendingFile.appendChild(icon);
        pendingFile.appendChild(fileInfo);
        pendingFile.appendChild(buttons);
        sharedFiles.appendChild(pendingFile);
    });
    return sharedFiles;
}
