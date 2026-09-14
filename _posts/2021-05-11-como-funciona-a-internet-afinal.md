---
title: "Como funciona a Internet Afinal"
date: 2021-05-11 20:35:54 -0300
tags: [mosaic, internet, redes, network, browsers]
description: "Neste post iremos aprender a desbravar os tópicos de redes na raça!"
canonical_url: https://franzkurt.medium.com/como-funciona-a-internet-afinal-ff6182c0ec7a
medium_url: https://franzkurt.medium.com/como-funciona-a-internet-afinal-ff6182c0ec7a
---
Neste post iremos aprender a desbravar os tópicos de redes na raça!

Todos utilizamos diariamente uma ferramenta maravilhosa que é formada colaborativamente e mantida por milhares de computadores e usuários que criam solidariamente dezenas de conteúdos todo dia.

Vejo que hoje em dia todos sabem o que é estar na internet e navegar pelos diversos sites que tem performance e design mas poucos sabem que ficamos limitados como usuários as decisões de programadores pois enxergamos apenas o que o browser nos oferece. Apenas o que os aplicativos nos apresentam como a internet, sem notar que a rede mesmo onde encontram-se os códigos da matrix, estão sendo transferidos por trás dos panos.

### Mas como se parece a internet ?

Todo computador em rede com outro está numa rede, numa mini internet. Mas para estes computadores estarem no que conhecemos como ***A Internet*** eles devem estar ligados a pelo menos um computador que já pertença a original.

O protocolo criado na Darpa (uma empresa militar norte americana com diversos avanços e propostas tecnológicas) e derivado como uma rede para as universidades e para o mundo hoje conta com bilhões de dispositivos conectados.

A imagem abaixo é um emaranhado de pontos interconectados que representa muito próximo a realidade embora saibamos que alguns servidores controlam grande parte do fluxo de dados mundial. Estes servidores controlados por entidades monopolistas como Google e Amazon trazem uma certa centralização a rede mas nada que devamos nos preocupar ainda.

### Na China que possui um firewall de restrição para sites em tempo real já não da mais tempo de se preocupar, mas fica para outro tópico!

<figure>
  <img src="/assets/img/medium/como-funciona-a-internet-afinal/01.png" alt="">
</figure>

Um browser ou navegador de internet é apenas uma ferramenta baseada no primeiro aplicativo criado para distribuir conteúdo online chamado mosaic.

Muito diferente dos sites atuais, (veja a imagem abaixo) o conteúdo era distribuido inicialmente como um simples arquivo de texto.

<figure>
  <img src="/assets/img/medium/como-funciona-a-internet-afinal/02.jpeg" alt="">
</figure>

Com o passar dos anos foi criado um protocolo chamado ***HTTP***, que por ser muito prático e resiliente tornou-se padrão da indústria e até hoje é usado por trás dos panos em conexões cliente-***servidor***, ou notebook-***site*** .

### Quem veio primeiro: Cliente ou Servidor?

É importante entender que ambos são computadores o que os diferencia é se eles estão servindo os arquivos (lado servidor) ou acessando os arquivos (lado cliente). Assim podemos oferecer serviços com maior performance no acesso e armazenamento de arquivos no lado servidor (nginx, ssh, ftp, etc..) e no lado cliente o navegador realiza o pedido no servidor e download dos arquivos da maneira mais rápida possível.

<figure>
  <img src="/assets/img/medium/como-funciona-a-internet-afinal/03.jpeg" alt="">
</figure>

HTTP significa [***protocolo de transferencia em hipertexto*** ](https://pt.wikipedia.org/wiki/Hypertext_Transfer_Protocol),ou seja, como enviar arquivos pela rede para que outros computadores entendam os bytes transmitidos. O navegador independente do sistema operacional realiza sempre as mesmas operações, que chamamos de comando do protocolo HTTP: GET (pegar), POST (postar), PUT (re-postar), HEAD (cabeçalho), OPTIONS (opções). Para realizar o download de um site por exemplo o navegador realiza uma chamada GET na porta 80 com a requisição ***/*** (barra) que significa para o servidor — Desejo realizar o download do arquivo raiz!

Abaixo podemos ver a requisição completa utilizando o utilitário netcat. Como ele apenas realizou o download (o navegador interpreta o código e executa na interface gráfica) e podemos lê-lo em texto claro.

<figure>
  <img src="/assets/img/medium/como-funciona-a-internet-afinal/04.png" alt="">
</figure>

### Mas como os computadores entendem onde o site Google.com se encontra?

Existe um protocolo intermediário conhecido como DNS ou servidor que armazena nomes de domínio. Assim é possivel criar uma relação entre o nome dos sites e o endereço IP (o real endereço dos computadores).

Como o IP (Protocolo de Internet) é dinâmico cada vez que um computador se conecta na internet ele adquire um endereço novo, isso previne que computadores sejam donos de endereços mas da mesma forma precisa de um intermediário para localizar o site nos diferentes endereços.

Portanto antes de realizar o download do arquivo rais do site, localizado em algum servidor o navegador executa uma chamada DNS que responde com o endereço atual da empresa requirida. Vejamos abaixo o utilitário host que imita esta funcionalidade do navegador — por baixo dos panos.

<figure>
  <img src="/assets/img/medium/como-funciona-a-internet-afinal/05.png" alt="">
</figure>

Agora temos o endereço mais recente do google em 142.250.218.238 e podemos requisitar o documento raiz com o netcat — perceba que é o mesmo documento da chamada anterior, apenas feita em dois passos distintos.

<figure>
  <img src="/assets/img/medium/como-funciona-a-internet-afinal/06.png" alt="">
</figure>

### Surge um termo novo: o Hacker!

Com o avanço tecnológico e apesar da robustez do protocolo surgiram usuários mal intencionados na rede. Devido a roubos e interceptação de comunicações o protocolo foi atualizado para ser mais seguro e passou a ser conhecido como HTTP***S “seguro”.***

A atualização implementou o famoso cadeado verde (presente nos navegadores) mas o que ele representa é muito mais complexo que isso:

A porta de requisição passou a ser a número 403 e uma chave assimétrica é gerada durante a conexão com a porta.

[***Chave Assimétrica***](https://pt.wikipedia.org/wiki/Criptografia_de_chave_p%C3%BAblica) é aquela em que existem duas chaves (uma pública e outra privada) e o mais importante: quando um texto é encriptado com uma não pode ser decriptado pela mesma, apenas pela outra***.***

### ***Interessante não?***

Com a chave assimétrica ocorre a troca de informação entre o servidor e o cliente de modo encriptado, o que impede que bisbilhoteiros na rede possam vizualizar o tráfego. Além disso e utilizando esta criptografia foi criado um sistema de certificados auditados que garantem que o site pertence a uma instituição verdadeira!

Em tese é criada uma cadeia de certificados onde a unidade predecessora garante que ela é integra assim como os sites que dela derivam. Como tudo na vida depende, cito que o site [letsencrypt](https://letsencrypt.org/pt-br/), site que emite certificados para sites de forma gratuita, permite que pessoas mal intencionadas emitam certificados para sites duvidosos e portanto não devem ser considerados válidos. — infelizmente aqui a maioria paga pelos pecadores!
