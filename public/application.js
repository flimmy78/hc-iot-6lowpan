var mainAppModuleName = 'hc-iot';

var mainModuel = angular.module(mainAppModuleName, ['ngResource', 'ngRoute', 'users', 'admin', 'nodes']);

mainModuel.config(['$locationProvider',	function($locationProvider) {
		$locationProvider.hashPrefix('!');
}]);

angular.element(document).ready(function() {
	angular.bootstrap(document, [mainAppModuleName]);
});