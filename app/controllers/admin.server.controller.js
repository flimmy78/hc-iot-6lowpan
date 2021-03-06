var Node = require('mongoose').model('Node');
var request = require('../../config/request');

var getErrorMessage = function(err) {
	if (err.errors) {
		for (var errName in err.errors) {
			if (err.errors[errName].message) return err.errors[errName].message;
		}
	} else {
		return '未知错误';
	}
};

exports.render = function(req, res) {
	req.session.lastPage = '/admin';
	res.render('admin', {
		lang: req.session.lang || 'zh',
		title: {
			'zh': '后台管理',
			'en': 'Admin'
		},
		home: {
			'zh': '首页',
			'en': 'Home'
		},
		signin: {
			'zh': '登录',
			'en': 'Login'
		},
		signup: {
			'zh': '注册',
			'en': 'Register'
		},
		signout: {
			'zh': '注销',
			'en': 'Logout'
		},
		user: JSON.stringify(req.user)
	});
};

exports.nodeByName = function(req, res, next, name) {
	Node.findOne({
		name: name
	}).populate('creator', 'email').exec(function(err, node) {
		if (err) {
			return next(err);
		}

		if (!node) {
			return next(new Error('非法Name ' + name));
		}

		req.node = node;
		next();
	});
};

exports.read = function(req, res) {
	res.json(req.node);
};

exports.online = function(req, res) {
	Node.find({
		'status': 1
	}, 'name').sort('name').exec(function(err, nodes) {
		if (err) {
			return res.status(400).send({
				message: getErrorMessage(err)
			});
		} else {
			res.json(nodes.map(function(x) {
				return x.name;
			}));
		}
	});
};

exports.mesh = function(req, res) {
	Node.find({
		'status': 1
	}, '-_id name parent').exec(function(err, nodes) {
		if (err) {
			return res.status(400).send({
				message: getErrorMessage(err)
			});
		} else {
			res.json(nodes);
		}
	});
};

exports.ctrl = function(req, res) {
	var node = req.node;
	var data = req.body;

	console.log(data);

	if (data.reboot) {
		// 下发退网指令
		request.post('force-leave-net', null, node);

		node.status = 0;
		node.parent = 'null';
	}

	if (data.switch) {
		if (data.switch === 'on') {
			node.switch = 1;
			node.level = 100;
		} else {
			node.switch = 0;
			node.level = 0;
		}

		// 同步开光状态
		request.post('switch-status', null, node, function(data) {
			console.log(data);
		});
	}

	if (data.brightness) {
		if (node.level !== data.brightness) {
			node.level = data.brightness;

			// 刷新调光信息
			request.post('dim-level', null, node);
		}
	}

	node.updated = new Date();
	node.save(function(err) {
		if (err) {
			return res.status(400).send({
				message: getErrorMessage(err)
			});
		} else {
			io.emit('nodeChanged', node);
			res.end();
		}
	});
};

exports.init = function(req, res) {
	var mapZ = {
		'A': -900,
		'B': -800,
		'C': -700,
		'D': -600,
		'E': -500,
		'F': -400,
		'G': -300,
		'H': -200,
		'I': -100,
		'J': 0,
	};

	var mapY = {
		'1': -150,
		'2': -150,
		'3': -150,
		'4': -150,
		'5': -50,
		'6': -50,
		'7': -50,
		'8': -50,
		'9': 50,
		'10': 50,
		'11': 50,
		'12': 50,
		'13': 150,
		'14': 150,
		'15': 150,
		'16': 150,
	};

	var gArray = {
		0: ['roots'],
		8: ['G1', 'H1', 'I1', 'J1', 'H2', 'I2'],
		7: ['G4', 'H4', 'I4', 'J4', 'H3', 'I3'],
		6: ['E5', 'F5', 'G5', 'H5', 'F6', 'G6'],
		5: ['E8', 'F8', 'G8', 'H8', 'F7', 'G7'],
		4: ['C9', 'D9', 'E9', 'F9', 'D10', 'E10'],
		3: ['C12', 'D12', 'E12', 'F12', 'D11', 'E11'],
		2: ['A13', 'B13', 'C13', 'D13', 'B14', 'C14'],
		1: ['A16', 'B16', 'C16', 'D16', 'B15', 'C15'],
		9: ['devices1', 'devices2', 'devices3', 'devices4', 'devices5'],
	};

	Node.find({}, function(err, nodes) {
		if (err) {
			return res.status(400).send({
				message: getErrorMessage(err)
			});
		} else {
			nodes.forEach(function(element, index) {
				element.status = 1;
				element.parent = null;
				element.level = 100;
				element.switch = 1;
				element.params.voltage = 0;
				element.params.current = 0;
				element.params.power = 0;
				element.params.frequency = 0;
				element.params.energy = 0;
				element.params.lifttime = 100;
				element.params.location = '上海';

				// 按规律刷新灯节点位置信息
				if (element.name !== 'roots' && element.name.substr(0, 7) !== "devices") {
					element.metadata.x = parseInt(element.name.substr(1, element.name.length - 1)) * 100 - 300;
					element.metadata.y = mapY[element.name.substr(1, element.name.length - 1)] - 300;
					element.metadata.z = mapZ[element.name.substr(0, 1)];
					console.log(mapZ[element.name.substr(0, 1)], mapY[element.name.substr(1, element.name.length - 1)], parseInt(element.name.substr(1, element.name.length - 1)) * 100);
				}

				function findGroup(name) {
					for (var i = 0; i <= 9; i++) {
						for (j in gArray[i]) {
							if (gArray[i][j] === name) {
								return i;
							}
						}
					}
				}
				element.groupId = findGroup(element.name);
				console.log(element.name, element.groupId);

				// 为便于测试，新增随机路由
				if (element.name !== 'roots') {
					// element.parent = gArray[element.groupId-1][Math.floor(Math.random()*gArray[element.groupId-1].length)];
					element.parent = gArray[element.groupId - 1][0];
					console.log(element.name, element.parent);
				}

				element.updated = new Date();
				element.save(function(err) {
					if (err) {
						return res.status(400).send({
							message: '未知错误'
						});
					} else {
						// 同步数据到所有终端
						// io.emit('onlineChanged', node);
						// 将当前分组信息刷新到服务器
						request.post('group-list', null, element);
					}
				});
			});
		}
		res.redirect('/admin#!/nodes');
	});
};

exports.gtest = function(req, res) {
	var levelList = [30, 40, 50, 60, 70, 80, 90, 100, 90, 80, 70, 60, 50, 40, 30];
	[1, 2, 3, 4, 5, 6, 7, 8].forEach(function(element) {
		var i = 0;
		Node.find({
			groupId: element
		}).exec(function(err, nodes) {
			if (err) {
				return err;
			}

			if (!nodes || nodes.length === 0) {
				return new Error('非法Group ' + element.name);
			}

			var post = function() {
				nodes[0].level = levelList[i++ % levelList.length];
				console.log(element, nodes[0].level);
				request.post('dim-level', nodes, null);
				if (i < levelList.length) {
					setTimeout(post, 15000);
				}
			};
			post();
		});
	});
	res.redirect('/admin#!/nodes');
};

exports.dtest = function(req, res) {
	var levelList = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
	Node.find({}, function(err, nodes) {
		if (err) {
			return res.status(400).send({
				message: getErrorMessage(err)
			});
		} else {
			nodes.forEach(function(node, index) {
				if (node.name === 'roots' || node.name.substr(0, 7) == 'devices') {
					return new Error('无需处理');
				}
				var post = function() {
					node.level = levelList[Math.floor(Math.random() * levelList.length)];
					console.log(node.name, node.level);
					request.post('dim-level', null, node);
				};
				post();
			});
		}
	});
	res.redirect('/admin#!/nodes');
};