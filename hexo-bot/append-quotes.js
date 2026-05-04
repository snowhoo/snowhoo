/**
 * append-quotes.js
 * 向 quotes-data.js 追加新名言（插入到最后的 ]; 之前）
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'quotes-data.js');

const newQuotes = [
  // ===== 新增：鲁迅 =====
  { quote: "愿中国青年都摆脱冷气，只是向上走，不必听自暴自弃者流的话。", author: "鲁迅", source: "《热风》", theme: "励志" },
  { quote: "希望是附丽于存在的，有存在，便有希望，有希望，便是光明。", author: "鲁迅", source: "《狂人日记》", theme: "励志" },
  { quote: "真的猛士，敢于直面惨淡的人生，敢于正视淋漓的鲜血。", author: "鲁迅", source: "《纪念刘和珍君》", theme: "励志" },
  { quote: "横眉冷对千夫指，俯首甘为孺子牛。", author: "鲁迅", source: "《自嘲》", theme: "智慧" },
  { quote: "世上本没有路，走的人多了，也便成了路。", author: "鲁迅", source: "《故乡》", theme: "智慧" },
  { quote: "时间就像海绵里的水，只要愿挤，总还是有的。", author: "鲁迅", source: "《鲁迅箴言》", theme: "智慧" },
  { quote: "不在沉默中爆发，就在沉默中灭亡。", author: "鲁迅", source: "《纪念刘和珍君》", theme: "励志" },
  { quote: "哀其不幸，怒其不争。", author: "鲁迅", source: "《孔乙己》", theme: "智慧" },
  { quote: "让死的水腐下去，让活的水沸腾起来。", author: "鲁迅", source: "《华盖集》", theme: "励志" },
  { quote: "人类的悲欢并不相通，我只觉得他们吵闹。", author: "鲁迅", source: "《而已集》", theme: "智慧" },
  { quote: "当我沉默的时候，我觉得充实；我将开口，同时感到空虚。", author: "鲁迅", source: "《野草》", theme: "智慧" },
  { quote: "改造自己，总比禁止别人来得难。", author: "鲁迅", source: "《且介亭杂文》", theme: "智慧" },
  { quote: "一个没有英雄的民族是可悲的民族，一个有英雄却不知敬重爱惜的民族是不可救药的民族。", author: "鲁迅", source: "《鲁迅杂文》", theme: "智慧" },
  { quote: "生命是我自己的东西，所以我不妨大步走去，向着我以为可以走去的路。", author: "鲁迅", source: "《华盖集》", theme: "励志" },
  { quote: "贪安稳就没有自由，要自由就总要历些危险。", author: "鲁迅", source: "《老调子已经唱完》", theme: "励志" },

  // ===== 新增：培根（Francis Bacon） =====
  { quote: "Knowledge is power.", author: "Francis Bacon", source: "《Meditationes Sacrae》", theme: "智慧" },
  { quote: "Reading makes a full man; conference a ready man; and writing an exact man.", author: "Francis Bacon", source: "《Of Studies》", theme: "智慧" },
  { quote: "Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.", author: "Francis Bacon", source: "《Of Studies》", theme: "智慧" },
  { quote: "A wise man will make more opportunities than he finds.", author: "Francis Bacon", source: "《OfBoldness》", theme: "智慧" },
  { quote: "If a man will begin with certainties, he shall end in doubts; but if he will be content to begin with doubts, he shall end in certainties.", author: "Francis Bacon", source: "《The Advancement of Learning》", theme: "智慧" },
  { quote: "The greatest virtue of man is to petition God for others and to compassionate the distressed.", author: "Francis Bacon", source: "《Essays》", theme: "智慧" },
  { quote: "He that gives good advice, builds with one hand; he that gives good counsel and example, builds with both.", author: "Francis Bacon", source: "《Essays》", theme: "智慧" },
  { quote: "Nature is gentle, and if she be left alone, she is more powerful than art.", author: "Francis Bacon", source: "《The Natural History》", theme: "智慧" },
  { quote: "Choose the most beneficial thing, not the most noble.", author: "Francis Bacon", source: "《Essays》", theme: "智慧" },

  // ===== 新增：尼采（Friedrich Nietzsche） =====
  { quote: "Was mich nicht umbringt, macht mich stärker.", author: "Friedrich Nietzsche", source: "《Götzen-Dämmerung》", theme: "励志" },
  { quote: "Man muss noch Chaos in sich haben, um einen tanzenden Stern gebären zu können.", author: "Friedrich Nietzsche", source: "《Also Sprach Zarathustra》", theme: "励志" },
  { quote: "Was du ererbt von deinen Vätern, musst du erwerben, um es zu besitzen.", author: "Friedrich Nietzsche", source: "《Also Sprach Zarathustra》", theme: "励志" },
  { quote: "Der Mensch ist ein Seil, geknüpft zwischen Tier und Übermensch – ein Seil über einem Abgrund.", author: "Friedrich Nietzsche", source: "《Also Sprach Zarathustra》", theme: "智慧" },
  { quote: "Es gibt immer irgendwo einen Ausgang aus der Krankheit heraus.", author: "Friedrich Nietzsche", source: "《Ecce Homo》", theme: "励志" },
  { quote: "There are no beautiful surfaces without a terrible depth.", author: "Friedrich Nietzsche", source: "《Beyond Good and Evil》", theme: "智慧" },
  { quote: "The higher we soar, the smaller we appear to those who cannot fly.", author: "Friedrich Nietzsche", source: "《Thus Spoke Zarathustra》", theme: "智慧" },
  { quote: "No one can construct for you the bridge upon which precisely you must cross the stream of life.", author: "Friedrich Nietzsche", source: "《Schopenhauer as Educator》", theme: "智慧" },

  // ===== 新增：歌德（Johann Wolfgang von Goethe） =====
  { quote: "Es ist nicht genug, zu wissen — man muss auch anwenden; es ist nicht genug, zu wollen — man muss auch tun.", author: "Johann Wolfgang von Goethe", source: "《Wilhelm Meister》", theme: "智慧" },
  { quote: "Handle so, dass die Maxime deines Willens jederzeit zugleich als Prinzip einer allgemeinen Gesetzgebung gelten könnte.", author: "Immanuel Kant", source: "《Grundlegung zur Metaphysik der Sitten》", theme: "智慧" },
  { quote: "Wer immer tut, was er schon kann, bleibt stets, was er schon ist.", author: "Johann Wolfgang von Goethe", source: "《Maximen und Reflexionen》", theme: "励志" },
  { quote: "Die beste Vorbereitung auf gute Arbeit ist gute Arbeit.", author: "Johann Wolfgang von Goethe", source: "《Maximen und Reflexionen》", theme: "励志" },
  { quote: "Es ist nicht die Aufgabe zu sehen, was noch niemand gesehen hat, sondern zu denken, was noch niemand gedacht hat.", author: "Johann Wolfgang von Goethe", source: "《Maximen und Reflexionen》", theme: "智慧" },
  { quote: "Mut ist die dispensable quality of a hero.", author: "Johann Wolfgang von Goethe", source: "《Iphigenie auf Tauris》", theme: "励志" },
  { quote: "Nothing is worth as much as this day.", author: "Johann Wolfgang von Goethe", source: "《Faust》", theme: "智慧" },
  { quote: "A man can fail many times, but he isn't a failure until he begins to blame somebody else.", author: "Johann Wolfgang von Goethe", source: "《Attributed》", theme: "励志" },
  { quote: "The soul that sees beauty may sometimes walk alone.", author: "Johann Wolfgang von Goethe", source: "《Wilhelm Meister》", theme: "智慧" },

  // ===== 新增：塞内卡（Seneca） =====
  { quote: "We suffer more often in imagination than in reality.", author: "Seneca", source: "《Letters from a Stoic》", theme: "智慧" },
  { quote: "Luck is what happens when preparation meets opportunity.", author: "Seneca", source: "《Letters from a Stoic》", theme: "智慧" },
  { quote: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca", source: "《On the Shortness of Life》", theme: "智慧" },
  { quote: "Difficulties strengthen the mind, as labor does the body.", author: "Seneca", source: "《Moral Letters to Lucilius》", theme: "励志" },
  { quote: "As is a tale, so is life: not how long it is, but how good it is, is what matters.", author: "Seneca", source: "《Letters from a Stoic》", theme: "智慧" },
  { quote: "Sometimes even to live is an act of courage.", author: "Seneca", source: "《Letters from a Stoic》", theme: "励志" },
  { quote: "He who is brave is free.", author: "Seneca", source: "《Letters from a Stoic》", theme: "励志" },
  { quote: "True happiness is to enjoy the present, without anxious dependence upon the future.", author: "Seneca", source: "《Letters from a Stoic》", theme: "智慧" },
  { quote: "The whole future lies in uncertainty: live immediately.", author: "Seneca", source: "《Letters from a Stoic》", theme: "励志" },
  { quote: "No man is free who is not master of himself.", author: "Seneca", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：苏格拉底（Socrates） =====
  { quote: "The unexamined life is not worth living.", author: "Socrates", source: "Plato's Apology", theme: "智慧" },
  { quote: "I know that I know nothing.", author: "Socrates", source: "Plato's Dialogues", theme: "智慧" },
  { quote: "Education is the kindling of a flame, not the filling of a vessel.", author: "Socrates", source: "Attributed", theme: "智慧" },
  { quote: "Strong minds discuss ideas, average minds discuss events, weak minds discuss people.", author: "Socrates", source: "Attributed", theme: "智慧" },
  { quote: "Be kind, for everyone you meet is fighting a hard battle.", author: "Socrates", source: "Attributed", theme: "智慧" },
  { quote: "To find yourself, think for yourself.", author: "Socrates", source: "Attributed", theme: "智慧" },
  { quote: "The only true wisdom is in knowing you know nothing.", author: "Socrates", source: "Attributed", theme: "智慧" },

  // ===== 新增：王阳明 =====
  { quote: "知是行的开始，行是知的完成。知而不行，等于不知。", author: "王阳明", source: "《传习录》", theme: "智慧" },
  { quote: "破山中之贼易，破心中之贼难。", author: "王阳明", source: "《与杨仕德薛尚谦书》", theme: "智慧" },
  { quote: "此心不动，随机而动。", author: "王阳明", source: "《传习录》", theme: "智慧" },
  { quote: "人须在事上磨，方能立得住；方能静亦定、动亦定。", author: "王阳明", source: "《传习录》", theme: "智慧" },
  { quote: "无善无恶心之体，有善有恶意之动。知善知恶是良知，为善去恶是格物。", author: "王阳明", source: "《传习录》", theme: "智慧" },
  { quote: "志不立，天下无可成之事。", author: "王阳明", source: "《教条示龙场诸生》", theme: "励志" },
  { quote: "知行合一，方是真知。", author: "王阳明", source: "《传习录》", theme: "智慧" },
  { quote: "减得一分人欲，便是复得一分天理。", author: "王阳明", source: "《传习录》", theme: "智慧" },
  { quote: "越是艰难处，越是修心时。", author: "王阳明", source: "《传习录》", theme: "励志" },

  // ===== 新增：庄子 =====
  { quote: "人皆知有用之用，而莫知无用之用也。", author: "庄子", source: "《人间世》", theme: "智慧" },
  { quote: "无用之用，是为大用。", author: "庄子", source: "《人间世》", theme: "智慧" },
  { quote: "相濡以沫，不如相忘于江湖。", author: "庄子", source: "《大宗师》", theme: "智慧" },
  { quote: "井蛙不可以语于海者，拘于虚也；夏虫不可以语于冰者，笃于时也。", author: "庄子", source: "《秋水》", theme: "智慧" },
  { quote: "天地与我并生，而万物与我为一。", author: "庄子", source: "《齐物论》", theme: "智慧" },
  { quote: "君子之交淡若水，小人之交甘若醴。", author: "庄子", source: "《山木》", theme: "智慧" },
  { quote: "吾生也有涯，而知也无涯。以有涯随无涯，殆已。", author: "庄子", source: "《养生主》", theme: "智慧" },
  { quote: "至乐无乐，至誉无誉。", author: "庄子", source: "《至乐》", theme: "智慧" },
  { quote: "举世而誉之而不加劝，举世而非之而不加沮。", author: "庄子", source: "《逍遥游》", theme: "智慧" },

  // ===== 新增：老子 =====
  { quote: "知人者智，自知者明。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "胜人者有力，自胜者强。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "祸兮，福之所倚；福兮，祸之所伏。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "上善若水，水善利万物而不争。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "以其不争，故天下莫能与之争。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "合抱之木，生于毫末；九层之台，起于累土。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "信言不美，美言不信。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "知足者富，强行者有志。", author: "老子", source: "《道德经》", theme: "智慧" },
  { quote: "为学日益，为道日损。", author: "老子", source: "《道德经》", theme: "智慧" },

  // ===== 新增：朱熹 =====
  { quote: "问渠那得清如许，为有源头活水来。", author: "朱熹", source: "《观书有感》", theme: "智慧" },
  { quote: "读书有三到，谓心到、眼到、口到。", author: "朱熹", source: "《训学斋规》", theme: "智慧" },
  { quote: "循序而渐进，熟读而精思。", author: "朱熹", source: "《读书之要》", theme: "智慧" },
  { quote: "少年易老学难成，一寸光阴不可轻。", author: "朱熹", source: "《偶成》", theme: "励志" },
  { quote: "格物致知，诚意正心。", author: "朱熹", source: "《大学章句》", theme: "智慧" },
  { quote: "涵养为首，致知次之，力行又次之。", author: "朱熹", source: "《朱子语类》", theme: "智慧" },

  // ===== 新增：林语堂 =====
  { quote: "一个人彻悟的程度，恰等于他所受痛苦的深度。", author: "林语堂", source: "《吾国与吾民》", theme: "智慧" },
  { quote: "人生不过如此，且行且珍惜。自己永远是自己的主角，不要总在别人的戏剧里充当着配角。", author: "林语堂", source: "《人生不过如此》", theme: "智慧" },
  { quote: "幸福无非四件事：一是睡在自家床上，二是吃父母做的菜，三是听爱人讲情话，四是跟孩子做游戏。", author: "林语堂", source: "《人生不过如此》", theme: "智慧" },
  { quote: "我们最重要的不是去计较真与伪，得与失，名与利，贵与贱，贫与富，而是如何好好地快乐度日。", author: "林语堂", source: "《生活的艺术》", theme: "智慧" },
  { quote: "人要有着落，有寄托，才是人生。", author: "林语堂", source: "《京华烟云》", theme: "智慧" },

  // ===== 新增：木心 =====
  { quote: "岁月不饶人，我亦未曾饶过岁月。", author: "木心", source: "《云雀叫了一整天》", theme: "励志" },
  { quote: "所谓无底深渊，下去，也是前程万里。", author: "木心", source: "《素履之往》", theme: "励志" },
  { quote: "我追索人心的深度，却看见了人心的浅薄。", author: "木心", source: "《云雀叫了一整天》", theme: "智慧" },
  { quote: "从前车马很慢，书信很远，一生只够爱一个人。", author: "木心", source: "《从前慢》", theme: "爱情" },
  { quote: "人类的地狱都是自己造成的。", author: "木心", source: "《文学回忆录》", theme: "智慧" },
  { quote: "艺术的生命良心，不是快乐，是安慰。", author: "木心", source: "《文学回忆录》", theme: "智慧" },
  { quote: "悲观是一种远见，鼠目寸光的人，不容易悲观。", author: "木心", source: "《文学回忆录》", theme: "智慧" },
  { quote: "知识是引出智慧的光，没有光，世界就是黑暗的。", author: "木心", source: "《文学回忆录》", theme: "智慧" },

  // ===== 新增：罗曼·罗兰（Romain Rolland） =====
  { quote: "世界上只有一种真正的英雄主义，那就是在认清生活的真相后依然热爱生活。", author: "Romain Rolland", source: "《米开朗琪罗传》", theme: "励志" },
  { quote: "La vie n'est pas un combat mais une chanson. / 生活中唯一的战斗，就是不断前进。", author: "Romain Rolland", source: "《约翰·克利斯朵夫》", theme: "励志" },
  { quote: "Nothing is more precious than independence and freedom.", author: "Romain Rolland", source: "《Attributed》", theme: "智慧" },
  { quote: "A really great man is known by the fact that he humbles himself to no one.", author: "Romain Rolland", source: "《Attributed》", theme: "智慧" },
  { quote: "La碧玺的唯一意义是行动。", author: "Romain Rolland", source: "《Attributed》", theme: "励志" },
  { quote: "Life这把武器，你要用它来做什么？用来创造美，不是用来毁灭。", author: "Romain Rolland", source: "《Attributed》", theme: "励志" },

  // ===== 新增：伯特兰·罗素（Bertrand Russell） =====
  { quote: "Three passions, simple but overwhelmingly strong, have governed my life: the longing for love, the search for knowledge.", author: "Bertrand Russell", source: "《A Russell's Autobiography》", theme: "智慧" },
  { quote: "The good life is one inspired by love and guided by knowledge.", author: "Bertrand Russell", source: "《Attributed》", theme: "智慧" },
  { quote: "Do not fear to be eccentric in opinion, for every opinion now accepted was once eccentric.", author: "Bertrand Russell", source: "《Attributed》", theme: "智慧" },
  { quote: "The fundamental cause of trouble in the world today is that the stupid are cocksure while the intelligent are full of doubt.", author: "Bertrand Russell", source: "《Attributed》", theme: "智慧" },
  { quote: "To conquer fear is the beginning of wisdom.", author: "Bertrand Russell", source: "《Attributed》", theme: "智慧" },
  { quote: "War does not determine who is right — only who is left.", author: "Bertrand Russell", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：萧伯纳（George Bernard Shaw） =====
  { quote: "Life isn't about finding yourself. Life is about creating yourself.", author: "George Bernard Shaw", source: "《Attributed》", theme: "励志" },
  { quote: "A life spent making mistakes is not only more honorable, but more useful, than a life spent doing nothing.", author: "George Bernard Shaw", source: "《Attributed》", theme: "励志" },
  { quote: "People who say it cannot be done should not interrupt those who are doing it.", author: "George Bernard Shaw", source: "《Attributed》", theme: "智慧" },
  { quote: "Imagination is the beginning of creation.", author: "George Bernard Shaw", source: "《Attributed》", theme: "智慧" },
  { quote: "The single biggest problem in communication is the illusion that it has taken place.", author: "George Bernard Shaw", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：洛克菲勒（John D. Rockefeller） =====
  { quote: "If you want to be successful, start thinking of yourself as a success.", author: "John D. Rockefeller", source: "《Attributed》", theme: "励志" },
  { quote: "The secret of success is to do the common thing uncommonly well.", author: "John D. Rockefeller", source: "《Attributed》", theme: "智慧" },
  { quote: "I have no secret of success but hard work.", author: "John D. Rockefeller", source: "《Attributed》", theme: "励志" },
  { quote: "If your only goal is to become rich, you will never achieve it.", author: "John D. Rockefeller", source: "《Attributed》", theme: "智慧" },
  { quote: "Next to doing the right thing, the most important thing is to let people know you are doing the right thing.", author: "John D. Rockefeller", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：稻盛和夫 =====
  { quote: "人生·工作的结果＝思维方式×热情×能力。", author: "稻盛和夫", source: "《活法》", theme: "智慧" },
  { quote: '坚持"燃烧的斗魂"，抱着纯粹而强烈的愿望，不懈地努力。', author: '稻盛和夫', source: '《活法》', theme: '励志' },
  { quote: "不要怕走弯路，重要的是你走的方向是否正确。", author: "稻盛和夫", source: "《活法》", theme: "智慧" },
  { quote: "每天的工作都需要全力以赴，每一天的积累就是一年，一年的积累就是一生。", author: "稻盛和夫", source: "《活法》", theme: "励志" },
  { quote: "积善行、思利他，就能领悟宇宙的法则，离幸福更近。", author: "稻盛和夫", source: "《活法》", theme: "智慧" },
  { quote: "乐观地设想，悲观地计划，愉快地执行。", author: "稻盛和夫", source: "《活法》", theme: "智慧" },

  // ===== 新增：林则徐 =====
  { quote: "苟利国家生死以，岂因祸福避趋之。", author: "林则徐", source: "《赴戍登程口占示家人》", theme: "励志" },
  { quote: "海纳百川，有容乃大；壁立千仞，无欲则刚。", author: "林则徐", source: "自题联", theme: "智慧" },
  { quote: "若鸦片一日不绝，本大臣一日不回。", author: "林则徐", source: "《林则徐集》", theme: "励志" },

  // ===== 新增：曾国藩 =====
  { quote: "天下古今之庸人，皆以一惰字致败；天下古今之才人，皆以一傲字致败。", author: "曾国藩", source: "《曾国藩家书》", theme: "智慧" },
  { quote: "既往不恋，当下不杂，未来不迎。", author: "曾国藩", source: "《曾国藩家书》", theme: "智慧" },
  { quote: "坚其志，苦其心，劳其力，事无大小，必有所成。", author: "曾国藩", source: "《曾国藩家书》", theme: "励志" },
  { quote: "天可补，海可填，南山可移。日月既往，不可复追。", author: "曾国藩", source: "《曾国藩家书》", theme: "智慧" },
  { quote: "家俭则兴，人勤则健；能勤能俭，永不贫贱。", author: "曾国藩", source: "《曾国藩家书》", theme: "智慧" },
  { quote: "唯天下之至诚能胜天下之至伪；唯天下之至拙能胜天下之至巧。", author: "曾国藩", source: "《曾国藩家书》", theme: "智慧" },

  // ===== 新增：李嘉诚 =====
  { quote: "眼睛仅盯在自己小口袋的是小商人，眼光放在全世界的是大商人。", author: "李嘉诚", source: "《Attributed》", theme: "智慧" },
  { quote: "栽种思想成就行为，栽种行为成就习惯，栽种习惯成就性格，栽种性格成就命运。", author: "李嘉诚", source: "《Attributed》", theme: "智慧" },
  { quote: "发光并非太阳的专利，你也可以发光。", author: "李嘉诚", source: "《Attributed》", theme: "励志" },
  { quote: "知识是通往成功的阶梯，但谦虚是通向知识的第一步。", author: "李嘉诚", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：比尔·盖茨（Bill Gates） =====
  { quote: "Success is a lousy teacher. It seduces smart people into thinking they can't lose.", author: "Bill Gates", source: "《Attributed》", theme: "智慧" },
  { quote: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates", source: "《Attributed》", theme: "智慧" },
  { quote: "It's fine to celebrate success but it is more important to heed the lessons of failure.", author: "Bill Gates", source: "《Attributed》", theme: "智慧" },
  { quote: "If you are born poor it's not your mistake, but if you die poor it is your mistake.", author: "Bill Gates", source: "《Attributed》", theme: "励志" },
  { quote: "We all need people who will give us feedback. That's how we improve.", author: "Bill Gates", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：奥普拉·温弗瑞（Oprah Winfrey） =====
  { quote: "Turn your wounds into wisdom.", author: "Oprah Winfrey", source: "《Attributed》", theme: "励志" },
  { quote: "The biggest adventure you can take is to live the life of your dreams.", author: "Oprah Winfrey", source: "《Attributed》", theme: "励志" },
  { quote: "You can have it all. You just can't have it all at once.", author: "Oprah Winfrey", source: "《Attributed》", theme: "智慧" },
  { quote: "Doing the best at this moment puts you in the best place for the next moment.", author: "Oprah Winfrey", source: "《Attributed》", theme: "智慧" },
  { quote: "Be thankful for what you have; you'll end up having more.", author: "Oprah Winfrey", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：乔布斯重复名句集中补充（原文已有部分，补充其余） =====
  { quote: "The people who are crazy enough to think they can change the world are the ones who do.", author: "Steve Jobs", source: "Apple Think Different campaign", theme: "励志" },
  { quote: "Stay hungry, stay foolish.", author: "Steve Jobs", source: "Stanford Commencement Speech 2005", theme: "励志" },
  { quote: "Design is not just what it looks like and feels like. Design is how it works.", author: "Steve Jobs", source: "《Attributed》", theme: "智慧" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs", source: "Stanford Commencement Speech 2005", theme: "励志" },

  // ===== 新增：叔本华（Arthur Schopenhauer） =====
  { quote: "We can do what we wish, but we can only wish what we are.", author: "Arthur Schopenhauer", source: "《Attributed》", theme: "智慧" },
  { quote: "The world is my representation.", author: "Arthur Schopenhauer", source: "《The World as Will and Representation》", theme: "智慧" },
  { quote: "A man can be himself only so long as he is alone.", author: "Arthur Schopenhauer", source: "《Attributed》", theme: "智慧" },
  { quote: "Pain is the positive element in life; pleasure is the negative.", author: "Arthur Schopenhauer", source: "《Attributed》", theme: "智慧" },
  { quote: "To live is to suffer; to survive is to find meaning in the suffering.", author: "Arthur Schopenhauer", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：亚里士多德（Aristotle）- 补充 =====
  { quote: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle", source: "《Nicomachean Ethics》", theme: "智慧" },
  { quote: "Patience is bitter, but its fruit is sweet.", author: "Aristotle", source: "《Attributed》", theme: "励志" },
  { quote: "Quality is not an act, it is a habit.", author: "Aristotle", source: "《Attributed》", theme: "励志" },
  { quote: "The educated differ from the uneducated as much as the living differ from the dead.", author: "Aristotle", source: "《Attributed》", theme: "智慧" },
  { quote: "Hope is a waking dream.", author: "Aristotle", source: "《Attributed》", theme: "智慧" },
  { quote: "The energy of the mind is the essence of life.", author: "Aristotle", source: "《Attributed》", theme: "智慧" },
  { quote: "Every act of kindness has some healing power of its own.", author: "John J. Hugh", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：威廉·詹姆斯（William James） =====
  { quote: "The art of being wise is the art of knowing what to overlook.", author: "William James", source: "《Attributed》", theme: "智慧" },
  { quote: "Act only according to that maxim whereby you can at the same time will that it should become a universal law.", author: "Immanuel Kant", source: "《Groundwork of the Metaphysics of Morals》", theme: "智慧" },
  { quote: "Happiness is not an ideal of reason, but of imagination.", author: "Immanuel Kant", source: "《Attributed》", theme: "智慧" },
  { quote: "We must also think of others, for we do not live alone.", author: "Maria Montessori", source: "《Attributed》", theme: "智慧" },
  { quote: "Free these little children. Let them run in the fields, breathe the pure air, and grow strong and healthy.", author: "Maria Montessori", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：戴尔·卡耐基（Dale Carnegie） =====
  { quote: "Success is getting what you want. Happiness is wanting what you get.", author: "Dale Carnegie", source: "《Attributed》", theme: "智慧" },
  { quote: "The most important thing in communication is hearing what isn't said.", author: "Peter Drucker", source: "《Attributed》", theme: "智慧" },
  { quote: "Laziness is nothing more than the habit of resting before you get tired.", author: "Jules Renard", source: "《Attributed》", theme: "励志" },
  { quote: "Keep your face always toward the sunshine—and shadows will fall behind you.", author: "Walt Whitman", source: "《Attributed》", theme: "励志" },

  // ===== 新增：马丁·路德·金补充 =====
  { quote: "Darkness cannot drive out darkness; only light can do that.", author: "Martin Luther King Jr.", source: "《Attributed》", theme: "智慧" },
  { quote: "The time is always right to do what is right.", author: "Martin Luther King Jr.", source: "《Attributed》", theme: "智慧" },
  { quote: "Injustice anywhere is a threat to justice everywhere.", author: "Martin Luther King Jr.", source: "Letter from Birmingham Jail", theme: "智慧" },
  { quote: "Our lives begin to end the day we become silent about things that matter.", author: "Martin Luther King Jr.", source: "《Attributed》", theme: "智慧" },
  { quote: "I have decided to stick with love. Hate is too great a burden to bear.", author: "Martin Luther King Jr.", source: "《Attributed》", theme: "智慧" },
  { quote: "Intelligence plus character—that is the goal of true education.", author: "Martin Luther King Jr.", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：纳尔逊·曼德拉（Nelson Mandela）补充 =====
  { quote: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela", source: "《Attributed》", theme: "励志" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela", source: "《Attributed》", theme: "励志" },
  { quote: "I learned that courage was not the absence of fear, but the triumph over it.", author: "Nelson Mandela", source: "《Attributed》", theme: "励志" },
  { quote: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela", source: "Speech, 1990", theme: "励志" },
  { quote: "A winner is a dreamer who never gives up.", author: "Nelson Mandela", source: "《Attributed》", theme: "励志" },

  // ===== 新增：乔·吉拉德（Joe Girard） =====
  { quote: "Nothing is impossible, the word itself says 'I'm possible'!", author: "Audrey Hepburn", source: "《Attributed》", theme: "励志" },
  { quote: "You can have results or excuses, not both.", author: "Conor McGregor", source: "《Attributed》", theme: "励志" },
  { quote: "I am not what happened to me. I am what I choose to become.", author: "Carl Jung", source: "《Attributed》", theme: "励志" },
  { quote: "Until you make the unconscious conscious, it will direct your life and you will call it fate.", author: "Carl Jung", source: "《Attributed》", theme: "智慧" },
  { quote: "Everything that irritates us about others can lead us to an understanding of ourselves.", author: "Carl Jung", source: "《Attributed》", theme: "智慧" },

  // ===== 新增：其他经典补充 =====
  { quote: "种一棵树最好的时间是十年前，其次是现在。", author: "中国谚语", source: "谚语", theme: "励志" },
  { quote: "书山有路勤为径，学海无涯苦作舟。", author: "韩愈", source: "《增广贤文》", theme: "励志" },
  { quote: "千里之堤，毁于蚁穴。", author: "韩非子", source: "《韩非子》", theme: "智慧" },
  { quote: "当局者迷，旁观者清。", author: "沈括", source: "《梦溪笔谈》", theme: "智慧" },
  { quote: "人有悲欢离合，月有阴晴圆缺。", author: "苏轼", source: "《水调歌头》", theme: "智慧" },
  { quote: "但愿人长久，千里共婵娟。", author: "苏轼", source: "《水调歌头》", theme: "爱情" },
  { quote: "回首向来萧瑟处，归去，也无风雨也无晴。", author: "苏轼", source: "《定风波》", theme: "智慧" },
  { quote: "十年生死两茫茫，不思量，自难忘。", author: "苏轼", source: "《江城子》", theme: "爱情" },
  { quote: "人生如逆旅，我亦是行人。", author: "苏轼", source: "《临江仙》", theme: "智慧" },
  { quote: "腹有诗书气自华，读书万卷始通神。", author: "苏轼", source: "《和董传留别》", theme: "励志" },
  { quote: "世事洞明皆学问，人情练达即文章。", author: "曹雪芹", source: "《红楼梦》", theme: "智慧" },
  { quote: "身后有余忘缩手，眼前无路想回头。", author: "曹雪芹", source: "《红楼梦》", theme: "智慧" },
  { quote: "满纸荒唐言，一把辛酸泪。", author: "曹雪芹", source: "《红楼梦》", theme: "智慧" },
  { quote: "滴不尽相思血泪抛红豆，开不完春柳春花满画楼。", author: "曹雪芹", source: "《红楼梦》", theme: "爱情" },

  // ===== 新增：更多当代智慧与人生格言 =====
  { quote: "把每一个黎明看作是生命的开始，把每一个黄昏看作是你生命的小结。", author: "约翰·罗斯金", source: "《Attributed》", theme: "智慧" },
  { quote: "不要等待机会，而要创造机会。", author: "乔治·萧伯纳", source: "《Attributed》", theme: "励志" },
  { quote: "你所以感到巨人高不可攀，那是因为你跪着。", author: "马克思", source: "《Attributed》", theme: "励志" },
  { quote: "当你以为门关上了的时候，其实它是开着的。", author: "保罗·柯艾略", source: "《牧羊少年奇幻之旅》", theme: "智慧" },
  { quote: "当你真心渴望某样东西时，整个宇宙都会来帮你。", author: "保罗·柯艾略", source: "《牧羊少年奇幻之旅》", theme: "智慧" },
  { quote: "If you want to achieve greatness stop asking for permission.", author: "Anonymous", source: "Attributed", theme: "励志" },
  { quote: "Don't count the days, make the days count.", author: "Muhammad Ali", source: "Attributed", theme: "励志" },
  { quote: "I hated every minute of training, but I said, 'Don't quit. Suffer now and live the rest of your life as a champion.'", author: "Muhammad Ali", source: "Attributed", theme: "励志" },
  { quote: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali", source: "Attributed", theme: "励志" },
  { quote: "If you always do what you have always done, you will always get what you have always gotten.", author: "Tony Robbins", source: "Attributed", theme: "励志" },
  { quote: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt", source: "Attributed", theme: "励志" },
  { quote: "A positive attitude causes a chain reaction of positive thoughts, events and outcomes.", author: "Wade Boggs", source: "Attributed", theme: "励志" },
  { quote: "It is not the load that breaks you down, it's the way you carry it.", author: "Lena Horne", source: "Attributed", theme: "智慧" },
  { quote: "Every day may not be good, but there is something good in every day.", author: "Alice Morse Earle", source: "Attributed", theme: "智慧" },
  { quote: "Be the energy you want to attract.", author: "Unknown", source: "Attributed", theme: "智慧" },
  { quote: "What you seek is seeking you.", author: "Rumi", source: "Attributed", theme: "智慧" },
  { quote: "The wound is the place where the Light enters you.", author: "Rumi", source: "Attributed", theme: "智慧" },
  { quote: "Let yourself be silently drawn by the strange pull of what you really love. It will not lead you astray.", author: "Rumi", source: "Attributed", theme: "智慧" },
  { quote: "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", author: "Rumi", source: "Attributed", theme: "智慧" },
  { quote: "Set your life on fire. Seek those who fan your flames.", author: "Rumi", source: "Attributed", theme: "励志" },
  { quote: "The art of knowing is knowing what to ignore.", author: "Rumi", source: "Attributed", theme: "智慧" },
  { quote: "Accept loss forever. Accept loss in your heart, and you will begin to find strength within.", author: "Miyamoto Musashi", source: "《The Book of Five Rings》", theme: "智慧" },
  { quote: "Think lightly of yourself and deeply of the world.", author: "Miyamoto Musashi", source: "《The Book of Five Rings》", theme: "智慧" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", source: "Attributed", theme: "励志" },
  { quote: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt", source: "Attributed", theme: "励志" },
  { quote: "Courage is not having the strength to go on; it is going on when you don't have the strength.", author: "Theodore Roosevelt", source: "Attributed", theme: "励志" },
  { quote: "Nothing in the world is worth having or worth doing unless it means effort, pain, difficulty.", author: "Theodore Roosevelt", source: "Attributed", theme: "励志" },
  { quote: "It is not the critic who counts; not the man who points out how the strong man stumbled.", author: "Theodore Roosevelt", source: "《Citizenship in a Republic》", theme: "励志" },
  { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon", source: "《Beautiful Boy》", theme: "智慧" },
  { quote: "Better to light one small candle than to curse the darkness.", author: "Chinese Proverb", source: "Proverb", theme: "励志" },
  { quote: "He who conquers himself is the mightiest warrior.", author: "Confucius", source: "Attributed", theme: "智慧" },
  { quote: "Real knowledge is to know the extent of one's ignorance.", author: "Confucius", source: "Attributed", theme: "智慧" },
  { quote: "Respect yourself and others will respect you.", author: "Confucius", source: "Attributed", theme: "智慧" },
  { quote: "Fall seven times, stand up eight.", author: "Japanese Proverb", source: "Proverb", theme: "励志" },
  { quote: "No matter how long the rain lasts, there will never be any true cold without hope.", author: "Dan Zadra", source: "Attributed", theme: "励志" },
  { quote: "Don't be pushed around by the fears in your mind. Be led by the dreams in your heart.", author: "Roy T. Bennett", source: "《The Light in the Heart》", theme: "励志" },
  { quote: "Be brave. Take risks. Nobody can touch you. You are the only master of your own destiny.", author: "Anita K. Booth", source: "Attributed", theme: "励志" },
  { quote: "The question isn't who is going to let me; it's who is going to stop me.", author: "Ayn Rand", source: "Attributed", theme: "励志" },
  { quote: "The person who says it cannot be done should not interrupt the person who is doing it.", author: "Chinese Proverb", source: "Proverb", theme: "励志" },
  { quote: "He who asks is a fool for five minutes, but he who does not ask remains a fool forever.", author: "Chinese Proverb", source: "Proverb", theme: "智慧" },
  { quote: "Give a man a fish and you feed him for a day. Teach him how to fish and you feed him for a lifetime.", author: "Chinese Proverb", source: "Proverb", theme: "智慧" },
  { quote: "To see what is right and not do it is the want of courage.", author: "Confucius", source: "Attributed", theme: "智慧" },
  { quote: "Learn as if you were to live forever.", author: "Mahatma Gandhi", source: "Attributed", theme: "励志" },
  { quote: "You must not lose faith in humanity. Humanity is an ocean; if a few drops of the ocean are dirty, the ocean does not become dirty.", author: "Mahatma Gandhi", source: "Attributed", theme: "智慧" },
  { quote: "An eye for an eye only ends up making the whole world blind.", author: "Mahatma Gandhi", source: "Attributed", theme: "智慧" },
  { quote: "First they ignore you, then they laugh at you, then they fight you, then you win.", author: "Mahatma Gandhi", source: "Attributed", theme: "励志" },
  { quote: "Happiness is when what you think, what you say, and what you do are in harmony.", author: "Mahatma Gandhi", source: "Attributed", theme: "智慧" },
  { quote: "No one who brags is brave. No one who is brave brags.", author: "古罗马谚语", source: "谚语", theme: "智慧" },
  { quote: "The best way to predict the future is to create it.", author: "Peter Drucker", source: "Attributed", theme: "励志" },
  { quote: "The most dangerous enemy of a better solution is a brilliant answer to an incorrect problem.", author: "Paul R. Lawrence", source: "《Attributed》", theme: "智慧" },
  { quote: "Never go to bed angry. Stay up and fight.", author: "Phyllis Bottome", source: "《Attributed》", theme: "智慧" },
  { quote: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson", source: "《Attributed》", theme: "励志" },
  { quote: "Excellence is not a destination but a continuous journey that never ends.", author: "Brian Tracy", source: "《Attributed》", theme: "励志" },
  { quote: "We generate fears while we sit. We overcome them by action.", author: "Dr. Henry Link", source: "《Attributed》", theme: "励志" },
  { quote: "A person who never made a mistake never tried anything new.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Life is like riding a bicycle. To keep your balance you must keep moving.", author: "Albert Einstein", source: "Letter to son, 1930", theme: "智慧" },
  { quote: "Try not to become a man of success. Rather become a man of value.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Once we accept our limits, we go beyond them.", author: "Albert Einstein", source: "《Attributed》", theme: "励志" },
  { quote: "The only thing that interferes with my learning is my education.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Not everything that can be counted counts, and not everything that counts can be counted.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Weakness of attitude becomes weakness of character.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Peace cannot be kept by force. It can only be achieved by understanding.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "If I had an hour to solve a problem I'd spend 55 minutes thinking about the problem and 5 minutes thinking about solutions.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "The world is a dangerous place, not because of those who do evil, but because of those who look on and do nothing.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "In the middle of difficulty lies opportunity.", author: "Albert Einstein", source: "《Attributed》", theme: "励志" },
  { quote: "Imagination is more important than knowledge.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Two things are infinite: the universe and human stupidity; and I'm not sure about the universe.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "There are only two ways to live your life. One is as though nothing is a miracle. The other is as though everything is a miracle.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "If you want to live a happy life, tie it to a goal, not to people or things.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Never memorize something that you can look up.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "We cannot solve our problems with the same thinking we used when we created them.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "The true sign of intelligence is not knowledge but imagination.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Only a life lived for others is a life worthwhile.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "Education is what remains after one has forgotten what one has learned in school.", author: "Albert Einstein", source: "《Attributed》", theme: "智慧" },
  { quote: "He who knows others is wise; he who knows himself is enlightened.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "Nature does not hurry, yet everything is accomplished.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "Being deeply loved by someone gives you strength, while loving someone deeply gives you courage.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "When I let go of what I am, I become what I might be.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "Life is a series of natural and spontaneous changes. Don't resist them.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "励志" },
  { quote: "Watch your thoughts, they become your words.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "If you do not change direction, you may end up where you are heading.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "To attain knowledge, add things every day. To attain wisdom, remove things every day.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "The best fighter is never angry.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
  { quote: "An ant on the move does not bother the one who is sleeping.", author: "Lao Tzu", source: "《Tao Te Ching》", theme: "智慧" },
];

const content = fs.readFileSync(DATA_FILE, 'utf8');
const lastCommaIdx = content.lastIndexOf(',\n];');
if (lastCommaIdx === -1) {
  console.error('未找到插入点，请检查文件格式');
  process.exit(1);
}

const prefix = content.slice(0, lastCommaIdx + 1);
const suffix = '\n];\n';

const newContent = prefix + ',\n' + newQuotes.map(q => {
  return `  { quote: ${JSON.stringify(q.quote)}, author: ${JSON.stringify(q.author)}, source: ${JSON.stringify(q.source)}, theme: ${JSON.stringify(q.theme)} }`;
}).join(',\n') + suffix;

fs.writeFileSync(DATA_FILE, newContent, 'utf8');

const count = newQuotes.length;
console.log(`[done] 成功追加 ${count} 条名言到 quotes-data.js`);
