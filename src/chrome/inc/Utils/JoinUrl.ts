
export class JoinUrl {

    public static joinUrl(baseUrl: string, path: string): string {
        let tbaseUrl = baseUrl;
        let tpath = path;

        if (tbaseUrl.endsWith('/')) {
            tbaseUrl = tbaseUrl.slice(0, -1);
        }

        if (tpath.startsWith('/')) {
            tpath = tpath.slice(1);
        }

        return `${tbaseUrl}/${tpath}`;
    }

}