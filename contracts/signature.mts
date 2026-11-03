export const SIGNATURE_TERMS_VERSION = "EPI-ELECTRONIC-SIMPLE-V2";
export const SIGNATURE_TERMS =
  "Declaro que sou o titular do nome informado e que utilizo meu próprio acesso para assinar. Li e conferi integralmente a ficha de EPI apresentada e concordo, de forma livre e consciente, em assiná-la eletronicamente. Aceito este meio de manifestação da minha vontade e adoto o nome e o estilo exibidos como representação da minha assinatura neste documento. Assumo a responsabilidade pela autoria desta manifestação e pela veracidade das informações que forneço. Estou ciente de que meu aceite, nome, estilo, data e hora, identificação do documento, verificação do e-mail, endereço IP e informações do navegador são registrados para comprovar a autoria e a integridade desta assinatura, com acesso restrito aos responsáveis autorizados. Este aceite não constitui autorização genérica para utilizar meus dados para outras finalidades. A assinatura não confirma, por si só, a entrega física dos equipamentos, não representa renúncia a direitos e não afasta as obrigações legais da empresa. Se houver informações incorretas ou se eu não concordar, devo interromper o processo e solicitar a correção ao responsável antes de assinar. Para esclarecer o tratamento dos meus dados e exercer meus direitos, posso procurar a empresa responsável pela ficha.";
export const SIGNATURE_STYLES = [
  {
    id: "classic",
    label: "Clássica",
    excelFont: "Dancing Script",
    font: '"Dancing Script", "Brush Script MT", cursive',
  },
  {
    id: "handwritten",
    label: "Manuscrita",
    excelFont: "Caveat",
    font: '"Caveat", "Comic Sans MS", cursive',
  },
  {
    id: "elegant",
    label: "Elegante",
    excelFont: "Allura",
    font: '"Allura", Georgia, serif',
  },
] as const;
export const normalizeSignerName = (name: string) =>
  name.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("pt-BR");
