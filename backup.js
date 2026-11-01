import { makeBackup } from './core.js';

export function saveFile(name, data, type = 'application/json') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Read-only snapshot. No character or chat writes; errors prevent a misleading complete backup. */
export async function fullBackup(host, state, progress = () => {}, signal) {
    const { zipSync, strToU8 } = await import('./vendor/fflate.js');
    const files = {}; const index = []; const books = new Set();
    const characters = [...host.ctx.characters];
    let bytes = 0;
    function add(path, value) {
        if (signal?.aborted) throw new Error('已取消备份，没有修改任何角色或聊天。');
        bytes += value.byteLength;
        if (bytes > 256 * 1024 * 1024) throw new Error('本次备份超过 256 MB，请使用酒馆原生数据备份。已停止，未生成不完整备份。');
        files[path] = value;
    }
    add('manager.json', strToU8(JSON.stringify(makeBackup(state), null, 2)));
    for (let i = 0; i < characters.length; i++) {
        if (signal?.aborted) throw new Error('已取消备份。');
        const c = characters[i];
        const directory = `characters/${String(i + 1).padStart(5, '0')}`;
        progress(`正在备份 ${i + 1}/${characters.length}：${c.name}`);
        add(`${directory}/card.png`, new Uint8Array(await (await host.exportCard(c.avatar)).arrayBuffer()));
        const chats = await host.listChats(c.avatar);
        const chatIndex = [];
        for (let j = 0; j < chats.length; j++) {
            const row = chats[j];
            const messages = await host.readChat(c.avatar, row.name);
            if (!messages.length) throw new Error(`${c.name} 的一份存档读取为空，已停止完整备份，请检查原生存档。`);
            const path = `${directory}/chats/${String(j + 1).padStart(5, '0')}.jsonl`;
            add(path, strToU8(messages.map(m => JSON.stringify(m)).join('\n')));
            chatIndex.push({ filename: row.name, path });
        }
        const linked = await host.worldbooks(c.avatar);
        linked.forEach(name => books.add(name));
        index.push({ avatar: c.avatar, name: c.name, card: `${directory}/card.png`, chats: chatIndex, worldbooks: linked });
    }
    const worldIndex = [];
    for (const name of books) {
        progress(`正在备份关联世界书：${name}`);
        const path = `worldbooks/${String(worldIndex.length + 1).padStart(5, '0')}.json`;
        add(path, strToU8(JSON.stringify(await host.readWorld(name), null, 2)));
        worldIndex.push({ name, path });
    }
    add('index.json', strToU8(JSON.stringify({ format: 'u-emperor-library-1', exportedAt: new Date().toISOString(), characters: index, worldbooks: worldIndex }, null, 2)));
    add('恢复说明.txt', strToU8('这是角色库快照，不是整个酒馆账号备份。\nmanager.json 可从 U皇万岁设置中恢复。\n角色 card.png 和聊天 jsonl 可通过酒馆原生导入。\n世界书 JSON 可通过酒馆世界书导入；index.json 记录了原角色标识、存档名和关联关系。\n首版不自动覆盖恢复角色、聊天或世界书。\n不包含群聊、预设、API 配置、外置资源和整个酒馆设置。\n'));
    progress('正在整理压缩包…');
    if (signal?.aborted) throw new Error('已取消备份。');
    return zipSync(files, { level: 1 });
}
